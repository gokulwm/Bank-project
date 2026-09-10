# Multimodal Smart Banking Kiosk

An integrated self-service banking kiosk system designed for fast, accessible, and secure cash transactions (deposits and withdrawals). It supports multilingual voice interactions (Tamil, English, Tanglish), face biometric authentication with liveness verification, encrypted digital QR receipts, and a real-time staff/teller dashboard.

---

## Architecture Overview

The system is split into microservices communicating over REST APIs and WebSockets:

```
                  ┌──────────────────────┐
                  │ Customer Kiosk UI    │  (:5173 - React/Vite)
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │ (Voice Audio)       │ (Face Capture)      │ (Session Flow)
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌────────────────────────┐
│ Voice AI     │      │ Face Auth    │      │ Backend Core FSM       │
│ (:8200)      │      │ (:8002)      │      │ (:8000)                │
└──────────────┘      └──────────────┘      └──────────┬─────────────┘
                                                       │
                                     ┌─────────────────┴─────────────────┐
                                     │ (Generate QR)                     │ (WebSocket Queue)
                                     ▼                                   ▼
                              ┌──────────────┐                    ┌──────────────┐
                              │ Security QR  │                    │ Staff Portal │
                              │ (:8105)      │                    │ (:5174)      │
                              └──────────────┘                    └──────────────┘
```

### Services & Port Mapping

| Service | Directory | Tech Stack | Port | Description |
|---|---|---|---|---|
| **Customer Kiosk** | `frontend/` | React, Vite, Lucide | `5173` | Touch & voice self-service UI for banking customers |
| **Staff Dashboard** | `Staff_Portal/` | React, Vite, WebSockets | `5174` | Real-time queue monitor and QR scanner for tellers |
| **Backend Core** | `Backend/module4_backend/` | FastAPI, Python | `8000` | Transaction state machine (FSM), business rules, and session lifecycle |
| **Face Auth** | `Face-Authentication/` | FastAPI, OpenCV, SQLite | `8002` | Biometric enrollment, face verification, and anti-spoofing |
| **Voice AI** | `voice_module/` | FastAPI, Python NLP | `8200` | Intent parsing & entity extraction for English, Tamil, and Tanglish |
| **Security QR** | `security-qr-service/` | FastAPI, HMAC-SHA256 | `8105` | Encrypted payload generator and QR validation service |

---

## Transaction Flow

1. **Voice or Touch Input**: Customer selects an action or speaks their intent in Tamil, English, or Tanglish (e.g., *"ஐந்தாயிரம் ரூபாய் எடுக்க வேண்டும்"* or *"Withdraw 5000"*).
2. **Intent Parsing**: The Voice AI service extracts the intent (`withdraw`/`deposit`), numeric amount, and confidence score.
3. **Face Authentication**: The kiosk camera captures the customer's face, verifies it against enrolled biometric templates, and checks for liveness.
4. **FSM Validation**: The core backend verifies account limits and transaction rules.
5. **Secure QR Generation**: The Security QR service signs the transaction payload using HMAC-SHA256 and generates a tamper-proof QR code printed on the digital receipt.
6. **Teller Queue & Settlement**: The transaction instantly appears on the Teller Dashboard via WebSockets. The teller scans the receipt QR to verify cryptographic integrity and disburses or collects the cash.

---

## Getting Started

### Prerequisites

- **Python**: 3.10+ (tested with Python 3.11/3.14)
- **Node.js**: 18.x or higher + `npm`
- **Webcam & Microphone**: Required for live face verification and voice input testing.

### Option 1: Quickstart (Windows Batch / PowerShell)

Run all 6 services with a single command from the project root:

```bash
# Using Batch script:
start_all.bat

# Or using PowerShell:
.\start_all.ps1
```

Once started, open:
- **Kiosk UI**: [http://localhost:5173](http://localhost:5173)
- **Staff Portal**: [http://localhost:5174](http://localhost:5174)
- **Face Enrollment Tool**: [http://localhost:8002/face-auth/enroll](http://localhost:8002/face-auth/enroll)
- **Face Verification Tool**: [http://localhost:8002/face-auth/verify](http://localhost:8002/face-auth/verify)

---

### Option 2: Docker Compose

```bash
docker-compose up --build
```

---

### Option 3: Running Services Manually

If you prefer to start each service individually:

#### 1. Backend Core (Port 8000)
```bash
cd Backend/module4_backend
python -m uvicorn app.main:app --port 8000 --reload
```

#### 2. Face Authentication (Port 8002)
```bash
cd Face-Authentication
python -m uvicorn app.main:app --port 8002 --reload
```

#### 3. Voice AI (Port 8200)
```bash
cd voice_module
python -m uvicorn app.main:app --port 8200 --reload
```

#### 4. Security QR Service (Port 8105)
```bash
cd security-qr-service
python -m uvicorn app.main:app --port 8105 --reload
```

#### 5. Customer Kiosk Frontend (Port 5173)
```bash
cd frontend
npm install
npm run dev -- --port 5173
```

#### 6. Staff Portal (Port 5174)
```bash
cd Staff_Portal
npm install
npm run dev -- --port 5174
```

---

## Testing

Comprehensive end-to-end multi-module integration tests are located in `tests/`.

To run the full test suite:

```bash
pytest tests/test_e2e_scenarios.py -v
```

The test suite validates:
- Standard withdrawal and deposit journeys
- Multilingual Tamil number parsing and voice intent extraction
- Biometric verification failure and retry limits
- Cryptographic QR token generation and signature verification
- Real-time teller WebSocket broadcast payload compliance

---

## Project Structure

```
.
├── Backend/                 # Transaction core orchestrator (FastAPI)
├── Face-Authentication/     # Biometric face recognition & enrollment
├── frontend/                # Customer-facing React Kiosk application
├── security-qr-service/     # HMAC-SHA256 encrypted QR generator/verifier
├── Staff_Portal/            # Teller dashboard & QR scanner
├── voice_module/            # NLP engine for English, Tamil, and Tanglish
├── tests/                   # End-to-end integration test suites
├── start_all.bat            # One-click launcher for Windows (Batch)
├── start_all.ps1            # One-click launcher for Windows (PowerShell)
├── docker-compose.yml       # Containerized multi-service deployment
└── README.md
```

---

## Common Troubleshooting

- **Face Enrollment 500 Error**: Make sure `opencv-python` and `pillow` are installed in your Python environment.
- **Microphone / Speech Recognition**: Ensure browser microphone permissions are allowed on `localhost:5173`.
- **WebSocket Queue Disconnections**: Confirm the backend service is running on `http://127.0.0.1:8000` before opening the staff portal at `localhost:5174`.
- **Port Conflicts**: Ensure ports `5173`, `5174`, `8000`, `8002`, `8105`, and `8200` are free on your machine.
