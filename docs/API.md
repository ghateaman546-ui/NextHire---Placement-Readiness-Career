# API Reference — NextHire

Base URL: `http://localhost:3000/api` (dev)
Auth: `Authorization: Bearer <token>` for 🔒 routes. 🔒👑 = admin only.
All routes below are backed by fully implemented controllers.

## Auth — `/auth`
POST `/signup` · POST `/login` · POST `/verify-email` · POST `/resend-verification`
POST `/forgot-password` · POST `/reset-password` · GET `/me` 🔒 · POST `/logout` 🔒

## Users — `/users`
GET `/profile` 🔒 · PUT `/profile` 🔒 · POST `/profile/photo` 🔒 · GET `/dashboard` 🔒

## Topics — `/topics`
GET `/` · POST `/` 🔒👑 · PUT `/:id` 🔒👑 · DELETE `/:id` 🔒👑

## Companies — `/companies` (company-specific question bank lives here)
GET `/` · GET `/:slug` (supports `?category=coding|aptitude|hr|technical`)
POST `/` 🔒👑 · PUT `/:id` 🔒👑 · DELETE `/:id` 🔒👑
POST `/:id/interview-experience` 🔒 · POST `/:id/previous-year-questions` 🔒👑

## Questions (DSA) — `/questions`
GET `/` 🔒 (`?company=&topic=&difficulty=&status=&search=&page=&limit=`) · GET `/:id` 🔒
POST `/` 🔒👑 · PUT `/:id` 🔒👑 · DELETE `/:id` 🔒👑
PATCH `/:id/status` 🔒 · PATCH `/:id/bookmark` 🔒 · PUT `/:id/notes` 🔒

## Interview Questions — `/interview-questions`
GET `/` 🔒 (`?category=&subject=&company=&difficulty=`) · GET `/:id` 🔒
POST `/` 🔒👑 · PUT `/:id` 🔒👑 · DELETE `/:id` 🔒👑

## Quizzes — `/quizzes` (aptitude AND domain-wise technical quizzes)
GET `/` 🔒 (`?category=Technical&subject=OS|DBMS|...` for domain-wise modules)
GET `/:id` 🔒 · POST `/` 🔒👑 · PUT `/:id` 🔒👑 · DELETE `/:id` 🔒👑
POST `/:id/submit` 🔒 · GET `/:id/leaderboard` 🔒

## Resumes — `/resumes` (resume parsing / ATS analyzer)
GET `/` 🔒 · POST `/builder` 🔒 · PUT `/builder/:id` 🔒
POST `/upload` 🔒 (multipart `resume`, extracts PDF text)
POST `/:id/analyze` 🔒 (LLM ATS scoring) · POST `/:id/improve` 🔒 · DELETE `/:id` 🔒

## AI Mock Interviews — `/mock-interviews` (solo, LLM-graded)
POST `/` 🔒 · GET `/` 🔒 · GET `/:id` 🔒
PUT `/:id/answers/:qId` 🔒 · POST `/:id/complete` 🔒 (triggers LLM scoring)

## Peer Mock Interviews — `/peer-mock-interviews` (scheduler + peer evaluation)
POST `/` 🔒 — schedule an open slot (`domain`, `scheduledFor`, `durationMinutes`, `meetingLink`)
GET `/available` 🔒 — open slots you can join
GET `/my` 🔒 — your sessions (as host or partner)
POST `/:id/join` 🔒 — match with an open slot
POST `/:id/complete` 🔒 — mark a session done
POST `/:id/cancel` 🔒 — host cancels
POST `/:id/feedback` 🔒 — submit the peer evaluation feedback form (ratings + comments about the other participant)

## Notes — `/notes`
GET `/` 🔒 · POST `/` 🔒 · PUT `/:id` 🔒 · PATCH `/:id/pin` 🔒 · PATCH `/:id/bookmark` 🔒 · DELETE `/:id` 🔒

## Dashboard — `/dashboard`
GET `/summary` 🔒 · GET `/progress/daily` 🔒 · GET `/progress/weekly` 🔒 · GET `/progress/monthly` 🔒 · GET `/skills` 🔒

## Leaderboard — `/leaderboard`
GET `/` 🔒 (`?range=weekly|monthly|all-time`) · GET `/me` 🔒

## Notifications — `/notifications`
GET `/` 🔒 · PATCH `/:id/read` 🔒 · PATCH `/read-all` 🔒

## Admin — `/admin` (all routes 🔒👑)
GET `/students` · PATCH `/students/:id/block` · PATCH `/students/:id/unblock` · DELETE `/students/:id`
GET `/analytics` · POST `/notifications` · GET `/notifications` · DELETE `/notifications/:id`
