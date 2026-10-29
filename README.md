# NextHire — Placement Readiness & Career

A full-stack platform to help engineering students prepare for campus
placements: DSA practice, aptitude + domain-wise technical quizzes,
interview prep with a company-specific question bank, an AI resume
parser/ATS analyzer, AI mock interviews, a peer mock interview scheduler
with evaluation forms, notes, a coding playground, progress dashboards,
and a leaderboard — plus an admin panel.

## Tech Stack
**Frontend:** React (Vite), Tailwind CSS, React Router, Axios
**Backend:** Node.js, Express.js, MongoDB + Mongoose, JWT auth, bcrypt, Multer, Cloudinary
**AI:** Anthropic Claude API (resume analysis, mock interview feedback, question generation)
**Deployment target:** Frontend → Vercel · Backend → Render · Database → MongoDB Atlas

## What's real vs. what's demo fallback
Every backend controller listed below is **fully implemented** (not a
stub) — real MongoDB queries, real JWT auth, real bcrypt hashing, real
LLM calls. The frontend calls these real endpoints first; if the backend
isn't running (e.g. you're just exploring the UI), each service function
in `frontend/src/services/*.js` automatically falls back to demo data so
every page still works. A **LIVE DATA / DEMO DATA** badge shows on
pages backed by a service so you always know which mode you're in.

## The Four Newer Features
1. **Resume parsing / ATS score analyzer** — `POST /api/resumes/upload` (PDF text
   extraction via `pdf-parse`) → `POST /api/resumes/:id/analyze` (scored via
   `backend/src/utils/llm.js`). Frontend: Resume → "Resume Parsing / ATS Analyzer" tab.
2. **Domain-wise technical quiz modules** — `Quiz` model with `category:
   'Technical'` + `subject` (OS/DBMS/OOP/JavaScript/React/...). Frontend:
   sidebar → "Technical Quizzes".
3. **Company-specific past interview question bank** — `Company.previousYearQuestions`,
   filterable by category. Frontend: Companies → click a company → PYQ bank with filters.
4. **Mock interview scheduler with peer evaluation** — new `PeerMockInterview`
   model + `peerMockInterview.controller.js`: schedule a slot, another
   student joins, both leave a structured star-rating + comments feedback
   form about each other. Frontend: sidebar → "Peer Mock Interview".
   (Separate from "AI Mock Interview", which is solo LLM-graded practice.)

## Project Structure
```
nexthire/
├── backend/src/
│   ├── config/        # db.js, cloudinary.js, multer.js
│   ├── models/        # 15 Mongoose schemas incl. PeerMockInterview.js
│   ├── controllers/   # fully implemented business logic (15 files)
│   ├── routes/        # wired to controllers, one file per resource
│   ├── middleware/     # auth.js, errorHandler.js, rateLimiter.js
│   ├── validators/     # auth.validator.js
│   ├── utils/          # llm.js, pdfParser.js, token.js, email.js, seed.js
│   ├── app.js, server.js
├── frontend/src/
│   ├── components/common/   # Card, Button, Input, StatCard, BarChart,
│   │                          ProgressRing, Badge, StarRating, LiveBadge
│   ├── components/layout/   # Sidebar, Topbar, DashboardLayout, AuthLayout,
│   │                          AdminSidebar, AdminLayout
│   ├── pages/auth/           # Login, Signup, ForgotPassword, ResetPassword
│   ├── pages/student/        # Dashboard, Profile, DsaSheet, Aptitude,
│   │                          TechnicalQuizzes, InterviewPrep, ResumeBuilder,
│   │                          MockInterview, PeerMockInterview, Companies,
│   │                          CompanyDetail, Playground, Leaderboard, Notes
│   ├── pages/admin/          # AdminDashboard, ManageStudents,
│   │                          ManageCompanies, ManageQuestions
│   ├── services/              # api.js + one *.service.js per feature
│   │                          (real API call, falls back to mock on failure)
│   ├── context/AuthContext.jsx
│   ├── routes/, data/mockData.js, hooks/
└── docs/API.md
```

## Installation

### Prerequisites
Node.js ≥ 18 · a MongoDB connection string (Atlas or local) · a Cloudinary
account (optional, for file uploads) · an Anthropic API key (for AI features)

### 1. Install
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment
```bash
cd backend && cp .env.example .env
# fill in MONGODB_URI and JWT_SECRET at minimum; ANTHROPIC_API_KEY to enable AI features
cd ../frontend && cp .env.example .env
```

### 3. Seed the database (recommended)
```bash
cd backend && npm run seed
```
This populates topics, companies (with PYQ banks), DSA questions, aptitude
quizzes, **domain-wise technical quizzes**, and the interview question bank.

### 4. Run
```bash
# Terminal 1
cd backend && npm run dev      # http://localhost:3000

# Terminal 2
cd frontend && npm run dev     # http://localhost:5173 ← open this
```
The frontend also works standalone (`npm run dev` in `frontend/` alone,
no backend needed) thanks to the demo-fallback services — you'll just see
"○ DEMO DATA" badges instead of "● LIVE DATA".

## Deployment
**Backend → Render:** root dir `backend`, build `npm install`, start `npm start`, add all `.env.example` vars, set `CLIENT_URL` to your Vercel URL.
**Frontend → Vercel:** root dir `frontend`, framework Vite, add `VITE_API_BASE_URL` = your Render URL + `/api`.
**Database → MongoDB Atlas:** create a cluster, whitelist Render's IP (or `0.0.0.0/0`), copy the connection string into `MONGODB_URI`.

## API Reference
See [`docs/API.md`](./docs/API.md).
