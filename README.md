# SafeCaller

SafeCaller now runs with a **real-data phone-first flow** (no placeholder contacts/chats):

- Sign in with **name + country code + phone + OTP**.
- Persist verified users as real identities.
- Add contacts by verified phone identity.
- Call contacts directly using WebRTC signaling by phone identity.
- Show real activity feed from stored signaling/auth/contact events.
- AI chat panel with **OpenAI-compatible API config** and one-click presets for **OpenRouter, Gemini, and ChatGPT**.

## Stack

- Node.js + Express + ws
- WebRTC (`RTCPeerConnection`) for media
- OTP/session APIs for identity bootstrap
- MongoDB (optional) for users, contacts, and event persistence

## Environment

```bash
PORT=3000
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=safecaller
```

If Mongo is unavailable, in-memory storage is used for users/contacts/sessions/events.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API

- `POST /auth/request-otp` → generate OTP (prototype returns `devOtp`)
- `POST /auth/verify-otp` → verify OTP and create session token
- `GET /contacts` → list your real contacts + user directory (auth required)
- `POST /contacts` → add a verified user as contact (auth required)
- `GET /activity` → list your real auth/contact/call events (auth required)
- `GET /health` → server health and runtime counters

## Flow

1. User A signs in and verifies OTP.
2. User B signs in and verifies OTP.
3. User A adds User B by country code + phone.
4. User A selects User B and initiates call.
5. WebSocket relay forwards signaling payloads to online target.

## Please report a bug when you find it

## License

This project is licensed under the **SafeCaller Custom License 1.0** (non-commercial by default). See `LICENSE`.
