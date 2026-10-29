# Start Here — NextHire

## Fastest way to see it (no install)
Open `frontend/` in your browser after just `npm install && npm run dev` —
the app works standalone via demo-fallback services (see README), no
backend or database required. You'll see "○ DEMO DATA" badges on
data-driven pages.

## Run backend + frontend together, in parallel (recommended)
A root `package.json` wires both apps up with `concurrently` so one command
boots everything:

```bash
# 1. Install everything (root, backend, frontend) in one go
npm run install:all

# 2. Configure
cd backend && cp .env.example .env
# fill in MONGODB_URI, JWT_SECRET, and (optional) ANTHROPIC_API_KEY, CLOUDINARY_*
cd ../frontend && cp .env.example .env
cd ..

# 3. Seed data (companies, DSA questions, aptitude + technical quizzes, interview bank)
npm run seed

# 4. Run backend (:3000) and frontend (:5173) together
npm run dev
```

`npm run dev` at the root starts the Express API and the Vite dev server
side by side in one terminal (color-coded `BACKEND` / `FRONTEND` logs). The
frontend's Vite dev server proxies `/api/*` to `http://localhost:3000`, so
there's no CORS setup needed in development.

Once both are running and seeded, every page — Dashboard, Notes,
Leaderboard, Mock Interview, and all of `/admin` — switches from
"○ DEMO DATA" to "● LIVE DATA" and is backed by real MongoDB documents and
(if `ANTHROPIC_API_KEY` is set) real AI analysis. Every `services/*.service.js`
call still tries the real API first and only falls back to mock data if a
call fails, so nothing breaks if the backend or DB isn't reachable — you
just see the demo badge again.

## Run them separately (manual, two terminals)
```bash
cd backend && npm install && npm run dev      # http://localhost:3000
cd frontend && npm install && npm run dev     # http://localhost:5173  ← open this
```

## Bootstrap an admin account
There is no public signup path to the admin role (by design). After
seeding, set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env` and run:
```bash
cd backend && npm run create-admin
```
Then log in on the frontend with that email/password — the `/admin`
pages will show `● LIVE DATA` and real write access.

## Deploying to production
See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full walkthrough — MongoDB
Atlas, backend on Render (or Docker), frontend on Vercel/Netlify, env
variable checklist, and a post-deploy verification checklist.

## What's genuinely new in this build
- **Rebranded** to NextHire — Placement Readiness & Career throughout.
- **Backend controllers are real**, not stubs: auth (signup/login/JWT/bcrypt/
  email verification/password reset), resumes (PDF parsing + AI ATS scoring),
  quizzes (aptitude + domain-wise technical, with real scoring), companies
  (with a growable PYQ bank), DSA questions (with per-user status/bookmark),
  AI mock interviews, and the new peer mock interview scheduler.
- **Four previously-missing features are now built end to end**, frontend
  and backend both:
  1. Resume parsing / ATS score analyzer (real file upload + LLM scoring)
  2. Domain-wise technical quiz modules (OS/DBMS/OOP/JavaScript/React/...)
  3. Company-specific past interview question bank (per-company, filterable)
  4. Mock interview scheduler with peer evaluation feedback forms
- **Frontend services degrade gracefully**: every `services/*.service.js`
  tries the real API first and only falls back to mock data if the call
  fails, so the same code works with zero setup or a fully configured stack.
