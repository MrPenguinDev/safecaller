import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { MongoClient, ServerApiVersion } from 'mongodb';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/signal' });
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static('.'));

const runtimeStats = {
  totalConnections: 0,
  activeConnections: 0,
  relayedSignals: 0,
  authRequests: 0,
  otpVerifications: 0,
  errors: 0
};

const otpStore = new Map();
const sessionStore = new Map();
const wsClientsByPhone = new Map();
const usersMemory = new Map(); // fullPhone -> user
const contactsMemory = new Map(); // ownerFullPhone -> Set<contactFullPhone>

let eventsCollection;
let usersCollection;
let userContactsCollection;

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCountryCode(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function persistEvent(event) {
  if (!eventsCollection) return;
  try {
    await eventsCollection.insertOne({ ...event, timestamp: new Date() });
  } catch (error) {
    runtimeStats.errors += 1;
    console.warn(`Failed to persist event: ${error.message}`);
  }
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('MONGODB_URI not provided. Running without persistence.');
    return;
  }

  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true
      }
    });
    await client.connect();

    const db = client.db(process.env.MONGODB_DB || 'safecaller');
    eventsCollection = db.collection('call_events');
    usersCollection = db.collection('users');
    userContactsCollection = db.collection('user_contacts');

    await eventsCollection.createIndex({ timestamp: -1 });
    await eventsCollection.createIndex({ actor: 1, timestamp: -1 });
    await usersCollection.createIndex({ fullPhone: 1 }, { unique: true });
    await userContactsCollection.createIndex({ owner: 1, contact: 1 }, { unique: true });

    console.log('MongoDB connected. Persistence is enabled.');
  } catch (error) {
    console.warn(`MongoDB unavailable: ${error.message}. Continuing without persistence.`);
  }
}

function getSessionFromAuthHeader(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  return sessionStore.get(token) || null;
}

async function upsertUser(profile) {
  usersMemory.set(profile.fullPhone, {
    name: profile.name,
    countryCode: profile.countryCode,
    phone: profile.phone,
    fullPhone: profile.fullPhone,
    lastSeen: new Date().toISOString()
  });

  if (usersCollection) {
    await usersCollection.updateOne(
      { fullPhone: profile.fullPhone },
      {
        $set: {
          name: profile.name,
          countryCode: profile.countryCode,
          phone: profile.phone,
          fullPhone: profile.fullPhone,
          lastSeen: new Date()
        }
      },
      { upsert: true }
    );
  }
}

async function getUserByFullPhone(fullPhone) {
  if (usersCollection) {
    const user = await usersCollection.findOne({ fullPhone }, { projection: { _id: 0 } });
    if (user) return user;
  }
  return usersMemory.get(fullPhone) || null;
}

async function listAvailableUsers(selfFullPhone) {
  if (usersCollection) {
    const users = await usersCollection
      .find({ fullPhone: { $ne: selfFullPhone } }, { projection: { _id: 0 } })
      .sort({ lastSeen: -1 })
      .limit(100)
      .toArray();
    return users;
  }

  return [...usersMemory.values()].filter((u) => u.fullPhone !== selfFullPhone);
}

async function listContacts(ownerFullPhone) {
  if (userContactsCollection) {
    const contacts = await userContactsCollection
      .aggregate([
        { $match: { owner: ownerFullPhone } },
        {
          $lookup: {
            from: 'users',
            localField: 'contact',
            foreignField: 'fullPhone',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        { $replaceRoot: { newRoot: '$user' } },
        { $project: { _id: 0 } },
        { $sort: { lastSeen: -1 } }
      ])
      .toArray();
    return contacts;
  }

  const ids = contactsMemory.get(ownerFullPhone) || new Set();
  return [...ids].map((id) => usersMemory.get(id)).filter(Boolean);
}

async function addContact(ownerFullPhone, contactFullPhone) {
  const exists = await getUserByFullPhone(contactFullPhone);
  if (!exists) return { ok: false, error: 'User not found. Contact must sign in first.' };

  if (userContactsCollection) {
    await userContactsCollection.updateOne(
      { owner: ownerFullPhone, contact: contactFullPhone },
      { $set: { owner: ownerFullPhone, contact: contactFullPhone, updatedAt: new Date() } },
      { upsert: true }
    );
  } else {
    if (!contactsMemory.has(ownerFullPhone)) contactsMemory.set(ownerFullPhone, new Set());
    contactsMemory.get(ownerFullPhone).add(contactFullPhone);
  }

  return { ok: true, contact: exists };
}

app.post('/auth/request-otp', async (req, res) => {
  runtimeStats.authRequests += 1;

  const mode = String(req.body?.mode || 'signup').toLowerCase() === 'login' ? 'login' : 'signup';
  const name = String(req.body?.name || '').trim();
  const countryCode = normalizeCountryCode(req.body?.countryCode);
  const phone = sanitizePhone(req.body?.phone);
  const fullPhone = `${countryCode}${phone}`;

  if (!countryCode || phone.length < 8) {
    return res.status(400).json({ error: 'countryCode and valid phone are required.' });
  }

  if (mode === 'signup' && !name) {
    return res.status(400).json({ error: 'name is required for sign up.' });
  }

  const existingUser = await getUserByFullPhone(fullPhone);
  if (mode === 'login' && !existingUser) {
    return res.status(404).json({ error: 'User not found. Please sign up first.' });
  }
  if (mode === 'signup' && existingUser) {
    return res.status(409).json({ error: 'User already exists. Please login instead.' });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  otpStore.set(fullPhone, {
    mode,
    name: mode === 'login' ? existingUser.name : name,
    countryCode,
    phone,
    fullPhone,
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  await persistEvent({ type: 'otp-request', actor: fullPhone, name });

  res.json({ ok: true, message: 'OTP generated for prototype.', devOtp: otp });
});

app.post('/auth/verify-otp', async (req, res) => {
  runtimeStats.otpVerifications += 1;

  const countryCode = normalizeCountryCode(req.body?.countryCode);
  const phone = sanitizePhone(req.body?.phone);
  const otp = String(req.body?.otp || '').trim();
  const fullPhone = `${countryCode}${phone}`;

  const stored = otpStore.get(fullPhone);
  if (!stored) return res.status(400).json({ error: 'OTP not requested for this phone.' });
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(fullPhone);
    return res.status(400).json({ error: 'OTP expired. Request again.' });
  }
  if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP.' });

  otpStore.delete(fullPhone);

  const token = crypto.randomBytes(24).toString('hex');
  const session = { token, ...stored, createdAt: Date.now() };
  sessionStore.set(token, session);

  await upsertUser(stored);
  await persistEvent({ type: 'otp-verified', actor: fullPhone, name: stored.name });

  res.json({ ok: true, token, profile: stored });
});

app.get('/contacts', async (req, res) => {
  const session = getSessionFromAuthHeader(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const contacts = await listContacts(session.fullPhone);
  const directory = await listAvailableUsers(session.fullPhone);
  res.json({ ok: true, contacts, directory });
});

app.post('/contacts', async (req, res) => {
  const session = getSessionFromAuthHeader(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const countryCode = normalizeCountryCode(req.body?.countryCode);
  const phone = sanitizePhone(req.body?.phone);
  if (!countryCode || !phone) return res.status(400).json({ error: 'countryCode and phone are required.' });

  const target = `${countryCode}${phone}`;
  if (target === session.fullPhone) return res.status(400).json({ error: 'Cannot add yourself as contact.' });

  const result = await addContact(session.fullPhone, target);
  if (!result.ok) return res.status(404).json(result);

  await persistEvent({ type: 'contact-added', actor: session.fullPhone, target });
  return res.json({ ok: true, contact: result.contact });
});

app.get('/activity', async (req, res) => {
  const session = getSessionFromAuthHeader(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  let events = [];
  if (eventsCollection) {
    events = await eventsCollection
      .find({
        $or: [{ actor: session.fullPhone }, { from: session.fullPhone }, { to: session.fullPhone }]
      }, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
  }

  res.json({ ok: true, events });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mongo: Boolean(eventsCollection), onlineUsers: wsClientsByPhone.size, ...runtimeStats });
});

wss.on('connection', (socket) => {
  runtimeStats.totalConnections += 1;
  runtimeStats.activeConnections += 1;

  let session = null;

  socket.on('message', async (rawData) => {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch {
      runtimeStats.errors += 1;
      sendJson(socket, { type: 'error', message: 'Invalid JSON payload.' });
      return;
    }

    if (message.type === 'auth') {
      const token = String(message.token || '');
      session = sessionStore.get(token) || null;
      if (!session) {
        sendJson(socket, { type: 'auth-failed', message: 'Invalid session token.' });
        return;
      }

      wsClientsByPhone.set(session.fullPhone, socket);
      sendJson(socket, { type: 'auth-ok', profile: session });
      await persistEvent({ type: 'socket-auth', actor: session.fullPhone });
      return;
    }

    if (!session) {
      sendJson(socket, { type: 'error', message: 'Authenticate first.' });
      return;
    }

    if (message.type === 'call-signal') {
      const target = String(message.to || '').trim();
      const targetSocket = wsClientsByPhone.get(target);
      runtimeStats.relayedSignals += 1;

      if (!targetSocket) {
        sendJson(socket, { type: 'user-offline', to: target });
        await persistEvent({ type: 'call-offline', from: session.fullPhone, to: target });
        return;
      }

      sendJson(targetSocket, { type: 'call-signal', from: session.fullPhone, payload: message.payload });
      await persistEvent({ type: 'call-signal', from: session.fullPhone, to: target, payloadType: message.payload?.type });
    }
  });

  socket.on('close', async () => {
    runtimeStats.activeConnections = Math.max(0, runtimeStats.activeConnections - 1);
    if (session?.fullPhone) {
      wsClientsByPhone.delete(session.fullPhone);
      await persistEvent({ type: 'socket-close', actor: session.fullPhone });
    }
  });
});

connectMongo().finally(() => {
  server.listen(port, () => {
    console.log(`SafeCaller server running at http://localhost:${port}`);
  });
});
