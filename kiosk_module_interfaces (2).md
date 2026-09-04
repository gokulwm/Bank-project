# Voice-Assisted Banking Kiosk — Module Interface Contracts (v0.1 draft)

Shared conventions used across every interface below:
- `session_id`: UUID v4, generated once per customer session at the kiosk, passed through every module.
- Timestamps: ISO 8601, UTC (e.g. `2026-08-21T10:15:30Z`).
- All inter-module messages are JSON unless explicitly noted as binary (audio).
- Every response includes a `status` field: `"ok"` or `"error"`. On error, include `"error_code"` and `"error_message"`.
- Transport: FastAPI REST for request/response calls, WebSocket (via Redis Pub/Sub) for real-time push (queue updates, dashboard events).

---

## 1. Frontend ↔ Voice AI

**Frontend → Voice AI** (audio stream, binary over WebSocket)
- Format: 16kHz mono PCM (WAV), chunked streaming
- Accompanying metadata sent once at session start:
```json
{
  "session_id": "uuid",
  "preferred_language": "ta | en | tanglish",
  "sample_rate": 16000
}
```

**Voice AI → Frontend** (response, two parts)
- TTS audio (binary, same streaming channel)
- Transcript/caption text alongside it, for on-screen display:
```json
{
  "session_id": "uuid",
  "spoken_text": "Please confirm: withdraw 5000 rupees?",
  "language": "ta"
}
```

---

## 2. Voice AI → Backend

Sent once an utterance is fully parsed into intent + entities.
```json
{
  "session_id": "uuid",
  "status": "ok",
  "language": "ta",
  "intent": "withdraw",
  "entities": {
    "amount": 5000,
    "account_number": "XXXX1234",
    "recipient": null
  },
  "confidence": 0.91,
  "raw_transcript": "aidhaayiram ruபாy edukkanum"
}
```
- `intent` enum: `open_account | deposit | withdraw | send_money | balance_check | unknown`
- Backend treats `confidence < 0.7` as "needs re-confirmation" and asks Voice AI to prompt the customer again — this threshold should be agreed jointly, not hardcoded by one side.

---

## 3. Biometrics → Backend

Sent once face verification checks resolve (face-only authentication).
```json
{
  "session_id": "uuid",
  "status": "ok",
  "auth_status": "pass",
  "methods_used": ["face"],
  "confidence_scores": {
    "face": 0.94
  },
  "liveness_passed": true,
  "customer_id": "acc_00981234"
}
```
- `auth_status` enum: `pass | fail | pending`
- `customer_id` is `null` for non-account-holders or when face is not recognized in gallery.
- Backend must not proceed past the auth gate on anything but `"pass"`.

---

## 4. Backend ↔ Security

**Backend → Security** (request to sign a transaction for teller handoff)
```json
{
  "session_id": "uuid",
  "customer_id": "acc_00981234",
  "transaction_type": "withdraw",
  "amount": 5000,
  "timestamp": "2026-08-21T10:15:30Z"
}
```

**Security → Backend** (signed, ephemeral token)
```json
{
  "status": "ok",
  "token_id": "uuid",
  "qr_payload": "base64-encoded-blob",
  "hmac_signature": "hex-encoded-hmac-sha256",
  "expires_at": "2026-08-21T10:25:30Z"
}
```
- Security owns key management and the HMAC-SHA256 signing; Backend never sees or stores the signing key.
- `expires_at` — Backend is responsible for enforcing this at the teller-portal side (reject expired tokens).

---

## 5. Backend/Security → Hardware & Staff Portal

**Push to teller/manager dashboard** (WebSocket event via Redis Pub/Sub)
```json
{
  "event": "new_queue_entry",
  "token_id": "uuid",
  "customer_display_name": "Customer #4821",
  "transaction_type": "withdraw",
  "amount": 5000,
  "queue_position": 3,
  "issued_at": "2026-08-21T10:15:35Z"
}
```
- Staff portal scans/enters `token_id`, verifies `hmac_signature` server-side (or via Backend verification endpoint) before acting.
- Receipt printing (`python-escpos`) is triggered by the Frontend/Kiosk locally on confirmation — not by Backend — since it's a local peripheral action tied to the kiosk session, not the teller flow.

---

## 6. Backend → Hardware dashboards (queue lifecycle events)

Additional WebSocket event types the Staff Portal module should listen for:
```json
{ "event": "queue_called", "token_id": "uuid", "teller_id": "t_02" }
{ "event": "transaction_completed", "token_id": "uuid" }
{ "event": "token_expired", "token_id": "uuid" }
```

---

## Open items to confirm as a team before coding starts
- Exact `intent` and `error_code` enums — finalize once all five modules' edge cases are known.
- Whether Voice AI ↔ Frontend audio streaming uses raw WebSocket binary frames or a wrapped protocol (e.g. base64 chunks) — affects Frontend and Voice AI owners directly.
- Confidence thresholds for auth pass/fail and intent re-confirmation — a shared, not unilateral, decision.
- Redis channel naming convention for Pub/Sub events (e.g. `kiosk:session:{session_id}:events`).
