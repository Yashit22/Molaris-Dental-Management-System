# 🦷 Molaris — Dental Management System (DMS)

> A full-stack, AI-powered, WhatsApp-integrated Dental Management System built as a multi-tenant SaaS for modern dental clinics.

---

## 🌟 What is Molaris?

**Molaris DMS** is a production-grade clinic management platform that replaces fragmented spreadsheets, manual WhatsApp follow-ups, and paper-based records with a unified, intelligent system. Every feature was built around a single goal: **let dentists focus on patients, not administration**.

Built as a freelance project, Molaris spans the full clinical and business lifecycle — from patient registration and dental charting to AI-generated clinical reports dictated via live voice, automated WhatsApp CRM, and a platform-level admin panel for multi-tenant management.

---

## ✨ Key Features & USPs

### 🤖 1. AI Clinical Report Generation — Voice → Report

The flagship feature. Doctors **speak into their device**; Molaris delivers a structured clinical report in seconds.

- **Live WebSocket relay**: Audio streams from the browser mic → ffmpeg (real-time resampling, no system dependency) → **Sarvam SAARAS v2.5** for Indian-language-aware speech-to-text, all over a persistent WebSocket connection.
- **LLM Report Generation**: Finalized transcript is sent to **Sarvam-105B** (a top-tier Indian multilingual LLM) which generates a structured clinical report streamed back via **Server-Sent Events (SSE)** — the report appears word-by-word in the UI.
- **Multi-template system**: Different report templates (Consultation, Post-op, Follow-up) with patient history auto-fill.
- **One-click delivery**: PDF saved to **Google Drive** (per-patient folder), delivered via **WhatsApp or Email**.
- Built to handle Indian medical terminology and code-switched speech (Hindi + English).

```
Doctor speaks → WebSocket → ffmpeg (webm→PCM) → Sarvam STT → Transcript
              → Sarvam-105B (SSE streaming) → Structured Report → PDF/Drive/WhatsApp
```

---

### 📲 2. WhatsApp CRM Automation — Full Appointment Lifecycle

A complete, fire-and-forget WhatsApp communication engine built on top of **WAAPI** (WhatsApp gateway).

**9 automated event types, all configurable per clinic:**

| Event | Timing | Description |
|---|---|---|
| `appointmentBooked` | Immediate | Confirmation when appointment is created |
| `appointmentReminder` | X hours *before* appointment | Scheduled relative to actual appointment time |
| `appointmentRescheduled` | Immediate | Notifies patient when date/time changes |
| `appointmentCancelled` | Immediate | Cancellation message with reason |
| `treatmentCompleted` | Configurable delay | Post-treatment confirmation |
| `invoiceGenerated` | Configurable delay | Invoice notification with amounts |
| `prescriptionIssued` | Immediate | Prescription PDF (auto-generated, Cloudinary-hosted) as WhatsApp document |
| `invoiceAndPrescription` | Configurable | Combined invoice + prescription |
| `postCare` | Multi-step journey | 3-step series (1h → 24h → 48h after completion) |

**Key technical details:**
- **28 template variables** with deep `{{placeholder}}` substitution across all content types
- **Language resolution chain**: Patient preference → Clinic default → Clinic fallback → English
- **Feedback poll system**: 5-star rating polls post-visit; responses synced with **WAHA middleware** for automated reply handling
- **Message logs**: Full audit trail with KPI dashboard (Sent / Pending / Failed)
- All WhatsApp operations are **fire-and-forget** — they never block the main API response

---

### 🏢 3. Multi-Tenant SaaS Architecture — Database-Per-Tenant Isolation

Each clinic (tenant) runs on a completely isolated MongoDB database.

```
Analytics DB (Shared)          Tenant DB (Per-Clinic, Isolated)
──────────────────────         ─────────────────────────────────
• dms_users (all staff)  ───▶  • patients, visits, invoices
• tenants (configs)            • appointments, inventory
• ConnectDesk admins           • whatsapp settings & templates
• Credit ledgers               • lab orders, vendors
```

- **JWT carries `tenantId`** — every request is resolved to the correct database in middleware
- **Production-grade connection pooling**: `minPoolSize: 5`, `maxPoolSize: 50`, heartbeat every 10s, auto-reconnect with exponential backoff
- **ConnectDesk**: A separate admin panel for platform operators to manage all tenants, view credits, and manage users — completely isolated from clinic-level auth

---

### 🌐 4. Patient-Facing Online Booking Portal

Patients can self-book appointments without calling the clinic.

- Public, unauthenticated booking page with live doctor availability
- Slot-based availability tied to doctor schedules
- Automated confirmation + reminder WhatsApp messages on booking
- UTC-safe time handling with IST display

---

### 🎛️ 5. ConnectDesk — Platform Admin Panel

A dedicated super-admin interface for platform operators (not clinic staff).

- Separate authentication (isolated JWT with `isAdmin` flag)
- Tenant overview: clinic info, credit balance, usage stats
- Admin invite system with secure token-based onboarding flow
- Completely isolated from clinic sessions (separate `localStorage` key, separate API instance)

---

## 🗂️ Module Overview

| Module | Description |
|---|---|
| **Appointments** | Calendar + list view, status lifecycle (7 stages), doctor-wise timeline, "Start Visit" flow |
| **Patients** | Full EMR — demographics, medical history, allergies, dentition chart, per-patient Google Drive folders |
| **Treatment** | Clinical charting by tooth/surface, treatment plan board, prescriptions, rich-text consultation notes |
| **Invoices** | Auto-ID invoicing, service/pharmacy items, payment recording, auto-inventory deduction |
| **Inventory** | 5-tab: stock overview, purchase orders, item list, audit logs, vendors. Auto-restock on order receipt. |
| **Lab Orders** | Lab catalog, vendor management, order tracking, CSV export |
| **Reports** | 17 report types — financial, clinical, patient analytics — with date filters and charts |
| **WhatsApp** | Template editor, event config, journey editor, media library, message logs |
| **Settings** | Integration configs, Sarvam key, Google Drive OAuth, Cloudinary credentials |
| **ConnectDesk** | Tenant management, credit management, admin user management |

---

## 🛠️ Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js + Express.js** | REST API server (port 5000) |
| **MongoDB Atlas + Mongoose** | Multi-tenant DB with production connection pooling |
| **Sarvam AI (saaras:v2.5)** | Live speech-to-text, Indian language aware |
| **Sarvam AI (sarvam-105b)** | Clinical report LLM, streamed via SSE |
| **WebSockets (ws)** | Real-time audio relay from browser to Sarvam |
| **ffmpeg-static** | In-process audio resampling (webm/opus → 16kHz PCM) |
| **WAAPI** | WhatsApp message gateway |
| **Google Drive API (OAuth2)** | Per-patient cloud file storage |
| **Cloudinary** | Media CDN for WhatsApp assets & prescription PDFs |
| **PDFKit + pdf-lib** | In-memory PDF generation |
| **Nodemailer** | Email notifications |
| **jsonwebtoken** | JWT auth with role + tenant context |
| **Multer** | File upload handling |
| **Puppeteer** | Server-side PDF rendering |

### Frontend

| Technology | Purpose |
|---|---|
| **React 18 + Vite** | SPA framework with fast HMR |
| **React Router v7** | Client-side routing with protected routes |
| **TailwindCSS** | Utility-first styling |
| **Axios** | HTTP client with JWT interceptor + auto-401 redirect |
| **Recharts + Chart.js** | Analytics data visualizations |
| **Lucide React** | Icon set |
| **MediaRecorder API** | Browser-side audio capture for voice dictation |

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                                 │
│  ┌─────────────┐  ┌─────────────────────┐  ┌──────────────────────┐ │
│  │ Clinic App  │  │ MediaRecorder        │  │ ConnectDesk Admin    │ │
│  │ Pages       │  │ (Voice → WS chunks)  │  │ (Isolated session)   │ │
│  └──────┬──────┘  └────────┬────────────┘  └──────────┬───────────┘ │
└─────────┼──────────────────┼─────────────────────────-┼─────────────┘
          │ HTTP/REST         │ WebSocket                │ HTTP/REST
          ▼                   ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Node.js + Express Backend                                           │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ REST Routes │  │ WS Relay Handler │  │ ConnectDesk Routes   │   │
│  │ (auth, JWT, │  │ (jwt → tenant →  │  │ (adminAuth, isolated  │   │
│  │ resolveTen) │  │  ffmpeg → Sarvam)│  │  analytics DB only)  │   │
│  └──────┬──────┘  └───────┬──────────┘  └──────────────────────┘   │
└─────────┼─────────────────┼────────────────────────────────────────-┘
          ▼                  ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────────────┐
│ Tenant MongoDB│  │  Sarvam APIs    │  │  External Services        │
│ (per-clinic)  │  │ • saaras:v2.5   │  │  • WAAPI (WhatsApp GW)   │
│               │  │   (STT stream)  │  │  • WAHA (WA middleware)  │
│ Analytics DB  │  │ • sarvam-105b   │  │  • Google Drive (OAuth2) │
│ (shared,      │  │   (LLM + SSE)   │  │  • Cloudinary (CDN)      │
│  all tenants) │  └─────────────────┘  │  • Nodemailer (email)    │
└───────────────┘                        └──────────────────────────┘
```

---

## 📁 Project Structure

```
DentalClinic_Demo/
├── dms_backend/
│   ├── index.js                     # Express + HTTP server + WS upgrade
│   ├── config/
│   │   ├── analyticsDb.js           # Shared DB (tenants, users, ConnectDesk)
│   │   ├── tenantDb.js              # Per-tenant DB pooling + auto-reconnect
│   │   └── resolveTenantContext.js  # Shared tenant resolver (REST + WS)
│   ├── middleware/
│   │   ├── auth.js                  # JWT authentication
│   │   ├── adminAuth.js             # ConnectDesk admin auth (isolated)
│   │   └── resolveTenant.js         # Tenant DB injection per request
│   ├── controllers/                 # Business logic per domain
│   ├── models/                      # 24+ Mongoose models
│   ├── routes/                      # Route definitions
│   ├── services/
│   │   ├── whatsapp.service.js      # WhatsApp engine (build + send + journey)
│   │   ├── credits.service.js       # Credit ledger (atomic debit/credit)
│   │   ├── documentPdf.service.js   # Document PDF generation
│   │   ├── cloudinary.service.js    # Media upload
│   │   └── googleDrive.service.js   # Drive folder + file management
│   ├── ws/
│   │   └── reportStream.ws.js       # Live audio → STT WebSocket relay
│   └── seeds/                       # DB seed and migration scripts
└── frontend/
    └── src/
        ├── App.jsx                  # Router + protected routes
        ├── Context/
        │   ├── AuthContext.jsx       # Auth state (token, user, login/logout)
        │   ├── UserContext.jsx       # User + tenant profile
        │   └── TreatmentContext.jsx  # Active treatment session state
        ├── hooks/
        │   ├── useLiveTranscriptionSocket.js  # WS client for voice dictation
        │   └── useDictation.js                # Dictation state management
        ├── pages/                   # 15+ feature pages
        ├── components/              # Shared UI components
        ├── modals/                  # 15+ modal components
        └── services/
            ├── api.js               # Axios (clinic, JWT interceptor)
            └── cdApi.js             # Axios (ConnectDesk, separate token)
```

---

## 🗄️ Database Models

**24+ Mongoose models across tenant and analytics databases:**

`Patient` · `Doctor` · `Appointment` · `Visit` · `Invoice` · `Transaction` · `InventoryItem` · `InventoryLog` · `Order` · `Vendor` · `LabOrder` · `LabCatalogItem` · `Services` · `Medicine` · `WhatsAppSettings` · `WhatsAppTemplate` · `WhatsAppLog` · `WhatsAppMedia` · `TreatmentJourney` · `PollTemplate` · `ReportJob` · `ClinicCredits` · `CreditLedger` · `DocumentSettings`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- Sarvam AI API key
- WAAPI account (for WhatsApp)
- Google Cloud project with Drive API + OAuth2 credentials *(optional)*
- Cloudinary account *(optional, for media)*

### Backend
```bash
cd dms_backend
npm install
# Configure dms_backend/.env (see CLAUDE.md for full env variable reference)
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Backend runs on **port 5000**, frontend on **port 5173** (Vite default).

> For the full environment variable reference and Google Drive OAuth one-time setup, see [`CLAUDE.md`](./CLAUDE.md).

---

## 🔐 Authentication Model

| Role | Token | Storage Key | Scope |
|---|---|---|---|
| Clinic staff (doctor/admin) | JWT `{ id, role, tenantId }` | `dms_token` | All clinic routes |
| ConnectDesk admin | JWT `{ id, isAdmin }` | `dms_admin_token` | Admin-only routes |

- All clinic routes except `/register`, `/login`, `/booking` are JWT-protected
- 401 responses auto-redirect to `/login` via Axios interceptor

---

## 🧠 Engineering Highlights

| Area | What was built |
|---|---|
| **Real-time audio pipeline** | Browser MediaRecorder → WebSocket → ffmpeg (in-process) → Sarvam streaming STT → rolling transcript |
| **SSE streaming report** | LLM output streams word-by-word to frontend, eliminating wait for large reports |
| **Multi-tenant DB isolation** | Each API request resolves the correct MongoDB connection from a pool; analytics and tenant DBs are entirely separate |
| **Production DB resilience** | Min 5 connections always warm, TCP keepalive heartbeat every 10s, auto-reconnect on drop |
| **WhatsApp scheduling** | Reminder fires exactly X hours *before* appointment time (not from booking time) — calculated against `start_time` |
| **Prescription PDF to WhatsApp** | PDFKit generates in-memory → uploads to Cloudinary → URL injected as `document` content type in WhatsApp |
| **Deep placeholder resolution** | `replacePlaceholdersDeep()` recursively resolves `{{var}}` across all WAAPI content types |
| **Language fallback chain** | Explicit → Clinic default → Clinic fallback → English, resolved at send time |

---

## 📊 Project Stats

| Metric | Value |
|---|---|
| Frontend pages | 15+ |
| Modal components | 15+ |
| API endpoints | 80+ |
| WhatsApp event types | 9 |
| Template variables | 28 |
| Database models | 24+ |
| Lines of code (approx.) | 40,000+ |

---

## 📄 License

This project is proprietary. All rights reserved.

---

*Built with ❤️ for modern dental care.*
