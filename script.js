const root = document.documentElement;
const modeButtons = document.querySelectorAll('.mode-btn');
const swatches = document.querySelectorAll('.swatch');
const animToggle = document.getElementById('animToggle');
const opacityRange = document.getElementById('opacityRange');
const opacityVal = document.getElementById('opacityVal');

const authCard = document.getElementById('authCard');
const requestOtpBtn = document.getElementById('requestOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const showLoginPageBtn = document.getElementById('showLoginPageBtn');
const showSignupPageBtn = document.getElementById('showSignupPageBtn');
const loginPage = document.getElementById('loginPage');
const signupPage = document.getElementById('signupPage');
const loginActions = document.getElementById('loginActions');
const signupActions = document.getElementById('signupActions');
const authName = document.getElementById('authName');
const authCountryCode = document.getElementById('authCountryCode');
const authPhone = document.getElementById('authPhone');
const signupCountryCode = document.getElementById('signupCountryCode');
const signupPhone = document.getElementById('signupPhone');
const authOtp = document.getElementById('authOtp');
const authHint = document.getElementById('authHint');
const userBadge = document.getElementById('userBadge');

const contactsList = document.getElementById('contactsList');
const directorySearch = document.getElementById('directorySearch');
const addContactBtn = document.getElementById('addContactBtn');
const contactCountryCodeInput = document.getElementById('contactCountryCodeInput');
const contactPhoneInput = document.getElementById('contactPhoneInput');
const contactResult = document.getElementById('contactResult');
const selectedContactLabel = document.getElementById('selectedContactLabel');
const selectedContactTitle = document.getElementById('selectedContactTitle');
const selectedContactSub = document.getElementById('selectedContactSub');
const activityFeed = document.getElementById('activityFeed');

const startCallBtn = document.getElementById('startCallBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');

const aiStatus = document.getElementById('aiStatus');
const presetOpenRouter = document.getElementById('presetOpenRouter');
const presetGemini = document.getElementById('presetGemini');
const presetChatgpt = document.getElementById('presetChatgpt');
const aiBaseUrl = document.getElementById('aiBaseUrl');
const aiModel = document.getElementById('aiModel');
const aiApiKey = document.getElementById('aiApiKey');
const aiSystemPrompt = document.getElementById('aiSystemPrompt');
const aiMessages = document.getElementById('aiMessages');
const aiInput = document.getElementById('aiInput');
const aiSendBtn = document.getElementById('aiSendBtn');

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
};

let socket;
let localStream;
let peerConnection;
let token;
let profile;
let selectedContactFullPhone = '';
let currentPeer = '';
let allContacts = [];
let allDirectory = [];
const aiConversation = [];

const fmtTime = (value) => new Date(value).toLocaleString();

let authPage = 'login';

function setAuthPage(page, options = {}) {
  const { preserveHint = false } = options;
  authPage = page;
  const isLogin = page === 'login';
  showLoginPageBtn.classList.toggle('active', isLogin);
  showSignupPageBtn.classList.toggle('active', !isLogin);
  loginPage.classList.toggle('active', isLogin);
  signupPage.classList.toggle('active', !isLogin);
  loginActions.classList.toggle('hidden', !isLogin);
  signupActions.classList.toggle('hidden', isLogin);
  if (!preserveHint) {
    authHint.textContent = isLogin
      ? 'Enter OTP from Sign Up and verify to continue.'
      : 'Create account details and request OTP.';
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    root.setAttribute('data-theme', btn.dataset.theme);
  });
});

swatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    swatches.forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    root.style.setProperty('--accent', swatch.dataset.accent);
  });
});

animToggle.addEventListener('change', (e) => {
  document.body.classList.toggle('no-anim', !e.target.checked);
});

opacityRange.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  root.style.setProperty('--pattern-opacity', String(val / 100));
  opacityVal.textContent = `${val}%`;
});

directorySearch.addEventListener('input', () => renderContacts());

function setStatus(message) {
  callStatus.textContent = message;
}

function setAiStatus(message) {
  aiStatus.textContent = message;
}

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCountryCode(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
}

function appendAiMessage(role, text) {
  const node = document.createElement('div');
  node.className = `msg ${role === 'user' ? 'outgoing' : 'incoming'}`;
  node.innerHTML = `<p><strong>${role}</strong> ${text}</p>`;
  aiMessages.appendChild(node);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function setAiPreset(kind) {
  if (kind === 'openrouter') {
    aiBaseUrl.value = 'https://openrouter.ai/api/v1';
    aiModel.value = 'openai/gpt-4o-mini';
    setAiStatus('Preset loaded: OpenRouter. Add your OpenRouter API key.');
    return;
  }

  if (kind === 'gemini') {
    aiBaseUrl.value = 'https://generativelanguage.googleapis.com/v1beta/openai';
    aiModel.value = 'gemini-1.5-flash';
    setAiStatus('Preset loaded: Gemini (OpenAI-compatible endpoint). Add your Gemini API key.');
    return;
  }

  aiBaseUrl.value = 'https://api.openai.com/v1';
  aiModel.value = 'gpt-4o-mini';
  setAiStatus('Preset loaded: ChatGPT. Add your OpenAI API key.');
}

function makeContactCard(user, source) {
  const card = document.createElement('article');
  card.className = 'chat-card';
  card.innerHTML = `
    <div class="avatar teal">${(user.name || '?').slice(0, 1).toUpperCase()}</div>
    <div class="chat-meta">
      <h4>${user.name}</h4>
      <p>${user.fullPhone}</p>
    </div>
    <div class="chat-side">
      <time>${source}</time>
    </div>`;

  card.addEventListener('click', () => {
    selectedContactFullPhone = user.fullPhone;
    selectedContactLabel.textContent = `${user.name} (${user.fullPhone})`;
    selectedContactTitle.textContent = user.name;
    selectedContactSub.textContent = user.fullPhone;
    contactResult.textContent = source === 'contact' ? 'Saved contact selected.' : 'Directory user selected.';
    renderContacts();
  });

  if (selectedContactFullPhone === user.fullPhone) {
    card.classList.add('active');
  }

  return card;
}

function renderContacts() {
  contactsList.innerHTML = '';
  const q = directorySearch.value.trim().toLowerCase();

  const contacts = allContacts.filter(
    (user) => !q || user.name.toLowerCase().includes(q) || user.fullPhone.toLowerCase().includes(q)
  );

  const directoryOnly = allDirectory
    .filter((d) => !allContacts.some((c) => c.fullPhone === d.fullPhone))
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.fullPhone.toLowerCase().includes(q));

  if (!contacts.length && !directoryOnly.length) {
    contactsList.innerHTML = '<p class="empty-list">No real users found yet. Ask others to sign in.</p>';
    return;
  }

  contacts.forEach((c) => contactsList.appendChild(makeContactCard(c, 'contact')));
  directoryOnly.forEach((d) => contactsList.appendChild(makeContactCard(d, 'directory')));
}

function renderActivity(events) {
  activityFeed.innerHTML = '';
  if (!events.length) {
    activityFeed.innerHTML = '<div class="day-pill">No real activity yet</div>';
    return;
  }

  events.forEach((event) => {
    const direction = event.actor === profile.fullPhone || event.from === profile.fullPhone ? 'outgoing' : 'incoming';
    const node = document.createElement('div');
    node.className = `msg ${direction}`;
    node.innerHTML = `<p><strong>${event.type}</strong> ${event.to || event.target || ''}</p><time>${fmtTime(
      event.timestamp || Date.now()
    )}</time>`;
    activityFeed.appendChild(node);
  });
}

async function refreshData() {
  const contactsRes = await api('/contacts');
  if (contactsRes.ok) {
    const payload = await contactsRes.json();
    allContacts = payload.contacts || [];
    allDirectory = payload.directory || [];
    renderContacts();
  }

  const activityRes = await api('/activity');
  if (activityRes.ok) {
    const payload = await activityRes.json();
    renderActivity(payload.events || []);
  }
}

async function requestOtp() {
  const payload = {
    name: authName.value.trim(),
    countryCode: normalizeCountryCode(signupCountryCode.value),
    phone: sanitizePhone(signupPhone.value)
  };

  const response = await api('/auth/request-otp', { method: 'POST', body: JSON.stringify(payload) });
  const data = await response.json();
  if (response.ok) {
    authCountryCode.value = payload.countryCode;
    authPhone.value = payload.phone;
    authHint.textContent = `OTP sent. Dev OTP: ${data.devOtp}. Now verify on Login page.`;
    setAuthPage('login', { preserveHint: true });
    return;
  }

  authHint.textContent = data.error || 'OTP request failed.';
}

async function verifyOtp() {
  const payload = {
    countryCode: normalizeCountryCode(authCountryCode.value),
    phone: sanitizePhone(authPhone.value),
    otp: authOtp.value.trim()
  };

  const response = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) {
    authHint.textContent = data.error || 'OTP verification failed.';
    return;
  }

  token = data.token;
  profile = data.profile;
  userBadge.textContent = `${profile.name} (${profile.fullPhone})`;
  authCard.classList.add('hidden');
  setStatus('Signed in. Add a real contact and call.');

  connectSignal();
  await refreshData();
}

function connectSignal() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${window.location.host}/signal`);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'auth', token }));
  });

  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'auth-ok') {
      setStatus('Realtime signaling connected.');
      return;
    }
    if (message.type === 'user-offline') {
      setStatus('Contact is offline.');
      return;
    }
    if (message.type === 'call-signal') {
      currentPeer = message.from;
      await handleRtcSignal(message.payload);
      await refreshData();
      return;
    }
    if (message.type === 'error' || message.type === 'auth-failed') {
      setStatus(message.message || 'Authentication failed.');
    }
  });
}

async function sendCallSignal(payload) {
  const target = selectedContactFullPhone || currentPeer;
  if (!target || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'call-signal', to: target, payload }));
}

async function handleRtcSignal(message) {
  if (message.type === 'offer') {
    await ensurePeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendCallSignal({ type: 'answer', answer });
    setStatus(`Incoming call answered (${currentPeer}).`);
  } else if (message.type === 'answer' && peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    setStatus('Call connected.');
  } else if (message.type === 'ice-candidate' && peerConnection && message.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
  } else if (message.type === 'hangup') {
    closePeerConnection();
    setStatus('Peer ended call.');
  }
}

async function ensureLocalMedia() {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  localVideo.srcObject = localStream;
}

async function ensurePeerConnection() {
  if (peerConnection) return;
  await ensureLocalMedia();
  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      await sendCallSignal({ type: 'ice-candidate', candidate: event.candidate });
    }
  };
}

function closePeerConnection() {
  if (!peerConnection) return;
  peerConnection.ontrack = null;
  peerConnection.onicecandidate = null;
  peerConnection.close();
  peerConnection = null;
  remoteVideo.srcObject = null;
}

async function addContact() {
  if (!profile) return setStatus('Sign in first.');

  const body = {
    countryCode: normalizeCountryCode(contactCountryCodeInput.value),
    phone: sanitizePhone(contactPhoneInput.value)
  };

  const response = await api('/contacts', { method: 'POST', body: JSON.stringify(body) });
  const data = await response.json();

  if (!response.ok) {
    contactResult.textContent = data.error || 'Cannot add contact.';
    return;
  }

  selectedContactFullPhone = data.contact.fullPhone;
  selectedContactLabel.textContent = `${data.contact.name} (${data.contact.fullPhone})`;
  selectedContactTitle.textContent = data.contact.name;
  selectedContactSub.textContent = data.contact.fullPhone;
  contactResult.textContent = 'Real contact added.';
  await refreshData();
}

async function sendAiMessage() {
  const userMessage = aiInput.value.trim();
  if (!userMessage) return;

  const baseUrl = aiBaseUrl.value.trim().replace(/\/$/, '');
  const model = aiModel.value.trim();
  const apiKey = aiApiKey.value.trim();

  if (!baseUrl || !model || !apiKey) {
    setAiStatus('Base URL, model, and API key are required.');
    return;
  }

  aiInput.value = '';
  appendAiMessage('user', userMessage);

  aiConversation.push({ role: 'user', content: userMessage });

  const systemPrompt = aiSystemPrompt.value.trim();
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push(...aiConversation);

  setAiStatus('Thinking...');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature: 0.7 })
    });

    const payload = await response.json();
    if (!response.ok) {
      const errorText = payload?.error?.message || payload?.message || 'AI request failed.';
      appendAiMessage('assistant', `Error: ${errorText}`);
      setAiStatus('Request failed. Check your config and key.');
      return;
    }

    const answer = payload?.choices?.[0]?.message?.content || 'No response text was returned by provider.';
    aiConversation.push({ role: 'assistant', content: answer });
    appendAiMessage('assistant', answer);
    setAiStatus('Response received.');
  } catch (error) {
    appendAiMessage('assistant', `Error: ${error.message}`);
    setAiStatus('Network error while reaching AI provider.');
  }
}

showLoginPageBtn.addEventListener('click', () => setAuthPage('login'));
showSignupPageBtn.addEventListener('click', () => setAuthPage('signup'));
requestOtpBtn.addEventListener('click', requestOtp);
verifyOtpBtn.addEventListener('click', verifyOtp);
addContactBtn.addEventListener('click', addContact);

startCallBtn.addEventListener('click', async () => {
  if (!selectedContactFullPhone) return setStatus('Select a real contact first.');
  currentPeer = selectedContactFullPhone;
  await ensurePeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await sendCallSignal({ type: 'offer', offer });
  setStatus(`Calling ${selectedContactFullPhone}...`);
  await refreshData();
});

hangupBtn.addEventListener('click', async () => {
  closePeerConnection();
  await sendCallSignal({ type: 'hangup' });
  setStatus('Call ended.');
  await refreshData();
});

presetOpenRouter.addEventListener('click', () => setAiPreset('openrouter'));
presetGemini.addEventListener('click', () => setAiPreset('gemini'));
presetChatgpt.addEventListener('click', () => setAiPreset('chatgpt'));
aiSendBtn.addEventListener('click', sendAiMessage);
aiInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendAiMessage();
  }
});

setAuthPage("login");
