# ShadowCoach — Project Deep Dive

> Technical documentation for backend interview preparation. Covers architecture, auth, database, AI pipeline, security, and every backend file.

---

## 1. Project Architecture Overview

### High-Level Architecture (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEVELOPMENT (split origins)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Browser (localhost:8080)                                                   │
│        │                                                                     │
│        │  axios + withCredentials: true                                      │
│        │  cookies: token, refreshToken (httpOnly)                            │
│        ▼                                                                     │
│   Express API (localhost:3000)                                               │
│        │                                                                     │
│        ├──► PostgreSQL (via Prisma)                                          │
│        ├──► Cloudinary (image CDN)                                           │
│        └──► Google Gemini / xAI Grok (stance analysis + chat)                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION (Vercel — same origin)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   https://your-app.vercel.app                                                │
│        │                                                                     │
│        ├── /              → TanStack Start SSR (Nitro serverless)          │
│        ├── /assets/*      → static Vite build                                │
│        └── /api/*         → Express app (Node.js 20 serverless function)     │
│                │                                                             │
│                ├──► PostgreSQL                                               │
│                ├──► Cloudinary                                               │
│                └──► Gemini / Grok                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure (Folder by Folder)

```
ShadowCoach/
├── package.json              # Root workspace scripts (dev:server, dev:frontend, vercel-build:ci)
├── vercel.json               # Vercel install/build commands
├── scripts/
│   ├── vercel-install.sh     # Installs server + frontend deps + esbuild
│   ├── vercel-build.sh       # Prisma generate → Vite build → prepare-vercel.mjs
│   └── prepare-vercel.mjs    # Merges Nitro output + Express into .vercel/output
│
├── server/                   # Express backend (Node.js ESM)
│   ├── index.js              # HTTP server entry (local dev / standalone)
│   ├── app.js                # Express app (exported; used by Vercel serverless)
│   ├── config/               # CORS, cookies, DB, Cloudinary
│   ├── middleware/           # Auth, rate limits, multer upload
│   ├── routes/               # Route mounting (/api/auth, /api/session)
│   ├── controllers/          # Request handlers
│   ├── services/             # Business logic (auth tokens, AI, storage)
│   └── prisma/               # Schema + SQL migrations
│
└── frontend/                 # TanStack Start + React + Vite
    ├── src/
    │   ├── routes/           # File-based routes (login, analyze, sessions, etc.)
    │   ├── lib/api/          # Axios client + typed API wrappers
    │   ├── hooks/            # useAuth (React Query)
    │   └── components/       # UI (shadow/* design system + shadcn/ui)
    ├── vite.config.ts        # Port 8080, TanStack Start + Nitro plugins
    └── server.ts             # Cloudflare-style fetch handler for SSR
```

This is a **logical monorepo**, not an npm workspaces setup. Root `package.json` orchestrates scripts; `server/` and `frontend/` each have their own `package.json` and `node_modules`.

### Frontend ↔ Backend Separation and Connection

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Frontend | TanStack Start (SSR), React 19, TanStack Router, React Query, Axios | UI, client-side auth state, API calls |
| Backend | Express 5, Prisma, JWT cookies | REST API, auth, AI orchestration, DB |
| Contract | JSON over HTTP; multipart for image upload | `/api/*` prefix on all endpoints |

**Dev:** Frontend runs on **port 8080** (`vite.config.ts`). Backend runs on **port 3000** (`server/index.js`). They are **different origins**, so CORS with `credentials: true` is required, and cookies use `sameSite: "none"` + `secure: true` when `CLIENT_URL` is set.

**Prod (Vercel):** `prepare-vercel.mjs` bundles the Express app as a serverless function at `/api`. The frontend uses relative URLs (`/api`) so requests are **same-origin**. Cookies use `sameSite: "lax"` because `VERCEL` env is set.

### What Runs Where

| Component | Local Dev | Vercel Production |
|-----------|-----------|-------------------|
| React SSR app | `localhost:8080` (Vite dev server) | Nitro serverless handler at `/` |
| Express API | `localhost:3000/api/*` | Node 20 serverless function at `/api/*` |
| PostgreSQL | External (Neon, Supabase, etc. via `DATABASE_URL`) | Same hosted DB |
| Cloudinary | External CDN | Same |
| Gemini / Grok | External API | Same |

**Key insight for interviews:** You did not deploy backend and frontend as two separate Vercel projects. You built a **unified Vercel deployment** where the build script stitches Nitro's frontend output with a copy of the entire `server/` folder into one `.vercel/output` bundle.

---

## 2. Backend Architecture

### Express App Structure

```
server/
├── index.js                    # Creates HTTP server, listens on PORT
├── app.js                      # Express app factory (middleware + routes)
├── config/
│   ├── cors.js                 # Origin allowlist + credentials
│   ├── cookies.js              # httpOnly cookie options per environment
│   ├── db.js                   # Prisma singleton
│   └── cloudinary.js           # Cloudinary SDK init
├── middleware/
│   ├── auth.middleware.js      # JWT from cookie → req.user
│   ├── rateLimiter.js          # general, auth, session creation limiters
│   └── upload.middleware.js    # Multer memory storage, 10MB limit
├── routes/
│   ├── auth.js                 # /api/auth/*
│   └── session.js              # /api/session/*
├── controllers/
│   ├── auth.controller.js      # register, login, logout, refresh, me
│   └── ssn.contoller.js        # analyze, list, get, follow-up, delete
└── services/
    ├── auth.service.js         # JWT sign/verify, refresh token rotation
    ├── ai.service.js           # Gemini/Grok stance + chat
    └── storage.service.js      # Cloudinary upload/delete
```

**Design pattern:** Classic layered architecture — routes wire middleware → controllers validate/coordinate → services hold reusable logic → Prisma for persistence. Controllers should stay thin; AI and token logic live in services.

### Middleware Chain (Global Order in `app.js`)

Applied to **every** request, in this exact order:

| # | Middleware | Source | What It Does |
|---|------------|--------|--------------|
| 1 | `trust proxy` | `app.js` L13–15 | Sets `trust proxy: 1` in production/Vercel so `req.ip` and secure cookies work behind Vercel's reverse proxy |
| 2 | `cors(getCorsOptions())` | `config/cors.js` | Handles preflight; sets `Access-Control-Allow-Credentials: true`; dev reflects any origin; prod checks allowlist |
| 3 | `generalLimiter` | `middleware/rateLimiter.js` | 100 requests / 15 min per IP; skips OPTIONS |
| 4 | `express.json()` | built-in | Parses `application/json` bodies |
| 5 | `express.urlencoded({ extended: true })` | built-in | Parses form-urlencoded bodies |
| 6 | `cookieParser()` | `cookie-parser` | Parses cookies into `req.cookies` |
| 7 | Route handlers | `routes/*` | Per-route middleware applied here |
| 8 | Global error handler | `app.js` L39–44 | Catches unhandled errors → 500 JSON |

**Per-route middleware** (applied after global chain):

**Auth routes** (`routes/auth.js`):
- `express.json()` + `cookieParser()` again (redundant with global, harmless)
- `authLimiter` on POST `/register`, POST `/login`
- `authmiddleware` on GET/POST `/me`

**Session routes** (`routes/session.js`):
- `express.json()` on router
- `authmiddleware` on all routes
- `sessionCreationLimiter` on POST `/analyze` only
- `upload.single("image")` on POST `/analyze` only

### Route Structure — Every Endpoint

Base paths are mounted in `app.js` as `/api/auth` and `/api/session`.

#### Health

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/api/health` | No | — | `200 { ok: true, db: true }` or `503 { ok: false, db: false, error }` |

Runs `prisma.$queryRaw\`SELECT 1\`` to verify DB connectivity.

#### Auth (`/api/auth`)

| Method | Path | Middleware | Request | Success Response | Error Responses |
|--------|------|------------|---------|------------------|-----------------|
| POST | `/register` | `authLimiter` | JSON: `{ fullName, email, password, age, country, state, sport, role, level }` | `201 { message: "USER SUCCESFULLY REGISTERED" }` | `400` validation, `409` duplicate email, `500` |
| POST | `/login` | `authLimiter` | JSON: `{ email, password }` | `200 { message, user }` + sets cookies | `400`, `404` not registered, `403` wrong password, `500` |
| POST | `/logout` | — | — (reads refresh cookie) | `200 { message }` + clears cookies | — |
| POST | `/refresh` | — | — (reads refresh cookie) | `200 { message, user }` + new cookies | `401` missing/invalid refresh |
| GET | `/me` | `authmiddleware` | — | `200 { user }` | `401`, `404`, `500` |
| POST | `/me` | `authmiddleware` | — | Same as GET `/me` | Same |

**Note:** Register does **not** log the user in or set cookies. Only login and refresh issue tokens.

#### Session (`/api/session`)

| Method | Path | Middleware | Request | Success Response | Error Responses |
|--------|------|------------|---------|------------------|-----------------|
| POST | `/analyze` | `authmiddleware`, `sessionCreationLimiter`, `upload.single("image")` | `multipart/form-data`: field `image` (file), optional `question` (string) | `201 { message, session }` | `400` no image, `404` user, `502` Cloudinary, `500` AI/other |
| GET | `/` | `authmiddleware` | — | `200 { sessions: [...] }` | `401`, `500` |
| GET | `/:id` | `authmiddleware` | — | `200 { session }` (includes `chats`) | `401`, `404`, `500` |
| POST | `/:id` | `authmiddleware` | JSON: `{ message: string }` | `200 { message, reply }` | `400`, `401`, `404`, `500` |
| DELETE | `/:id` | `authmiddleware` | — | `200 { message }` | `401`, `404`, `500` |

### Controller Pattern — Request Flow

Example: **POST `/api/session/analyze`**

```
1. Client sends multipart POST with cookie `token`
2. generalLimiter → cors → json/urlencoded/cookieParser (global)
3. sessionRouter matches POST /analyze
4. authmiddleware
   - Reads req.cookies.token
   - jwt.verify → req.user = { userId, email, fullName }
5. sessionCreationLimiter (5/hour)
6. upload.single("image") → req.file.buffer in memory
7. analyzeSession controller (ssn.contoller.js)
   a. writeUploadToTemp(file) → OS temp file path
   b. prisma.user.findUnique (athlete profile for AI context)
   c. analyzeStance() service → Gemini JSON coaching report
   d. uploadImageToCloudinary() → secure_url
   e. prisma.session.create → persist report + imageUrl
   f. finally: unlink temp file
8. res.status(201).json({ session })
```

**Ownership enforcement:** Session queries always include `userId: req.user.userId` in the `where` clause, so users cannot read or delete another user's sessions.

### Error Handling Strategy

The project uses **controller-level try/catch**, not a centralized error-throwing pattern.

| Layer | Strategy |
|-------|----------|
| Validation (Zod) | `safeParse` → `400` with `error.flatten()` |
| Auth middleware | Direct `401` JSON with `code: TOKEN_EXPIRED` or `INVALID_TOKEN` |
| Controllers | `try/catch` → appropriate status (`404`, `403`, `409`, `500`, `502`) |
| Global handler (`app.js`) | Only catches errors passed to `next(err)` — **currently unused** by controllers |
| AI service | Throws `Error` with descriptive messages; controller returns `500` |
| Cloudinary | Wrapped in `storage.service.js`; controller detects Cloudinary errors → `502` |

**Interview talking point:** Controllers return errors explicitly rather than calling `next(err)`. The global error handler is a safety net for future refactors. Rate limiter and CORS errors are handled by their respective libraries.

---

## 3. Authentication System

### Complete JWT Flow: Signup → Protected Route

```
┌──────────┐     POST /api/auth/register      ┌──────────┐
│  Client  │ ───────────────────────────────► │  Server  │
└──────────┘     { email, password, ... }     └────┬─────┘
                                                   │
                                    Zod validate → bcrypt.hash(10)
                                    prisma.user.create
                                                   │
◄──────────────────────────────────────────────────┘
     201 { message } — NO cookies set


┌──────────┐     POST /api/auth/login         ┌──────────┐
│  Client  │ ───────────────────────────────► │  Server  │
└──────────┘     { email, password }          └────┬─────┘
                                                   │
                         find user → bcrypt.compare
                         issueTokenPair(user, res, true)
                           ├─ signAccessToken (JWT, 15m)
                           ├─ random 48-byte refresh token
                           ├─ SHA-256 hash → RefreshToken table
                           └─ Set-Cookie: token + refreshToken
                                                   │
◄──────────────────────────────────────────────────┘
     200 { message, user } + httpOnly cookies


┌──────────┐     GET /api/session (protected)  ┌──────────┐
│  Client  │ ───────────────────────────────► │  Server  │
└──────────┘     Cookie: token=eyJ...        └────┬─────┘
                                                   │
                              authmiddleware:
                                req.cookies.token
                                jwt.verify → req.user
                              controller runs
                                                   │
◄──────────────────────────────────────────────────┘
     200 { sessions: [...] }
```

### HTTP-Only Cookie Configuration

Defined in `server/config/cookies.js`:

| Cookie Name | Constant | Contents | maxAge |
|-------------|----------|----------|--------|
| `token` | `AUTH_COOKIE_NAME` | JWT access token | 15 minutes (`ACCESS_MAX_AGE_MS`) |
| `refreshToken` | `REFRESH_COOKIE_NAME` | Opaque random hex (48 bytes) | 7 days (`REFRESH_MAX_AGE_MS`) |

**Cookie options by environment:**

```javascript
// Production + Vercel (same-origin deploy)
{ httpOnly: true, secure: true, sameSite: "lax", maxAge }

// Production, cross-origin (separate API domain)
{ httpOnly: true, secure: true, sameSite: "none", maxAge }

// Development, cross-origin (CLIENT_URL set)
{ httpOnly: true, secure: true, sameSite: "none", maxAge }

// Development, localhost-only (no CLIENT_URL)
{ httpOnly: true, secure: false, sameSite: "lax", maxAge }
```

**Why these choices:**
- `httpOnly: true` — JavaScript cannot read tokens (XSS mitigation)
- `secure: true` — HTTPS only in prod/cross-origin dev (required for `sameSite: "none"`)
- `sameSite: "lax"` on same-origin Vercel — cookies sent on top-level navigations
- `sameSite: "none"` on cross-origin dev — allows `localhost:8080` → `localhost:3000` with credentials

**JWT secret:** `JWT_USER_SECRET` env var. Access token expiry configurable via `ACCESS_TOKEN_EXPIRES` (default `"15m"`).

### Auth Middleware — Line by Line

File: `server/middleware/auth.middleware.js`

```javascript
function authmiddleware(req, res, next) {
    try {
        // 1. Read access token from httpOnly cookie named "token"
        const token = req.cookies[AUTH_COOKIE_NAME];

        // 2. Missing cookie → user not logged in
        if (!token) {
            return res.status(401).json({ message: "You are logged out" });
        }

        // 3. Verify JWT signature + expiry with JWT_USER_SECRET
        const decoded = verifyAccessToken(token);

        // 4. Attach payload to request for downstream handlers
        req.user = decoded;
        next();
    } catch (err) {
        // 5. Distinguish expired vs invalid tokens for client refresh logic
        const expired = err.name === "TokenExpiredError";
        return res.status(401).json({
            message: expired ? "Access token expired" : "Invalid or expired token",
            code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        });
    }
}
```

### What `req.user` Contains

After `verifyAccessToken`, `req.user` is the **JWT payload** signed in `auth.service.js`:

```javascript
{
  userId: string,   // User.id (cuid)
  email: string,
  fullName: string,
  iat: number,      // issued at (JWT standard)
  exp: number       // expiry (JWT standard)
}
```

Controllers use `req.user.userId` for DB queries. The password is **never** in the token.

### Logout Flow

`POST /api/auth/logout`:

1. Read `req.cookies.refreshToken`
2. `revokeRefreshToken()` — `deleteMany` where `tokenHash = SHA256(refreshToken)`
3. `res.clearCookie("token", getAccessCookieOptions())`
4. `res.clearCookie("refreshToken", getRefreshCookieOptions())`
5. Return `200 { message: "Logout successful" }`

Clearing cookies requires passing the **same options** (path, domain, sameSite, secure) used when setting them, or the browser may not delete them.

### Refresh Token Logic (Rotation)

**Issuance** (`issueTokenPair`):
1. Sign access JWT
2. Generate `crypto.randomBytes(48).toString("hex")` refresh token
3. Store **SHA-256 hash** in `RefreshToken` table (plaintext refresh token never stored)
4. Set both cookies on response

**Refresh** (`POST /api/auth/refresh`):
1. Read refresh cookie
2. Hash it, look up `RefreshToken` with `include: { user }`
3. If missing or `expiresAt < now` → delete if exists → `401` + clear cookies
4. **Rotate:** delete the used refresh token row (one-time use)
5. Issue **new** access + refresh pair via `issueTokenPair`
6. Return `200 { message, user }`

**Security properties:**
- Refresh tokens are opaque, not JWTs
- Only hashes stored in DB (leaked DB ≠ usable tokens)
- Rotation prevents replay of stolen refresh tokens
- `revokeAllUserRefreshTokens` exists but is not wired to any route yet

### Frontend Auto-Refresh

`frontend/src/lib/api/client.ts` Axios interceptor:
- On `401` with `code === "TOKEN_EXPIRED"`, calls `POST /auth/refresh`
- Retries the original request once (`_retry` flag)
- Deduplicates concurrent refresh calls via `refreshPromise` singleton

---

## 4. Database Layer

### Full Prisma Schema

#### `User`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String @id @default(cuid())` | Primary key; cuid for URL-safe unique IDs |
| `fullName` | `String` | Display name; passed to AI for personalized coaching |
| `email` | `String @unique` | Login identifier; normalized to lowercase on register/login |
| `password` | `String` | bcrypt hash (10 rounds); never returned in API |
| `age` | `Int` | Profile metadata |
| `country` | `String` | Profile metadata |
| `state` | `String` | Profile metadata |
| `sport` | `Sport` enum | CRICKET, FOOTBALL, BASKETBALL, BADMINTON — tailors AI prompts |
| `role` | `String` | Position (e.g. "batsman"); AI context |
| `level` | `ExperienceLevel` enum | BEGINNER, INTERMEDIATE, ADVANCED — AI difficulty calibration |
| `createdAt` | `DateTime @default(now())` | Audit |
| `updatedAt` | `DateTime @updatedAt` | Auto-updated on change |
| `sessions` | `Session[]` | One-to-many coaching sessions |
| `refreshTokens` | `RefreshToken[]` | One-to-many active refresh tokens |

#### `RefreshToken`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String @id @default(cuid())` | Primary key |
| `tokenHash` | `String @unique` | SHA-256 of opaque refresh token |
| `userId` | `String` | FK → User |
| `expiresAt` | `DateTime` | Default 7 days from issuance |
| `createdAt` | `DateTime @default(now())` | Audit |
| `@@index([userId])` | — | Fast lookup/revocation per user |

`onDelete: Cascade` — deleting a user removes their refresh tokens.

#### `Session`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String @id @default(cuid())` | Primary key |
| `imageUrl` | `String` | Cloudinary `secure_url` (public CDN link) |
| `overallScore` | `Int` | AI score 0–100 |
| `strengths` | `Json` | Array of strings from AI |
| `areasToImprove` | `Json` | Array of strings from AI |
| `priorityFix` | `String` | Single top correction |
| `drillSuggestion` | `String` | Recommended drill |
| `confidenceLevel` | `ConfidenceLevel` enum | LOW, MEDIUM, HIGH — AI self-assessed certainty |
| `aiRawResponse` | `Json?` | Full parsed AI output + optional `question`; debugging/audit |
| `createdAt` | `DateTime @default(now())` | Session timestamp |
| `userId` | `String` | FK → User (ownership) |
| `chats` | `ChatMessage[]` | Follow-up conversation history |

`onDelete: Cascade` — deleting user removes sessions and chats.

#### `ChatMessage`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String @id @default(cuid())` | Primary key |
| `role` | `ChatRole` enum | USER or ASSISTANT |
| `message` | `String` | Chat text content |
| `createdAt` | `DateTime @default(now())` | Message order |
| `sessionId` | `String` | FK → Session |

### Migrations

| Migration | Date | What It Does |
|-----------|------|--------------|
| `20260527120424_init` | Initial | Creates enums, User, Session, ChatMessage tables + FKs |
| `20260529071431_add_refresh_tokens` | Follow-up | Adds RefreshToken table + indexes |

**Commands:**
- `npm run postinstall` → `prisma generate` (client codegen)
- `npm run prisma:migrate` → `prisma migrate deploy` (apply migrations in prod)
- Dev: typically `npx prisma migrate dev` (not scripted, run manually)

`migration_lock.toml` locks provider to PostgreSQL.

### Every Prisma Query — Endpoint Mapping

| Query | File | Endpoint / Context |
|-------|------|-------------------|
| `prisma.user.findUnique({ where: { email } })` | auth.controller | POST `/register` — duplicate check |
| `prisma.user.create({ data: {...} })` | auth.controller | POST `/register` |
| `prisma.user.findUnique({ where: { email }, select: { ...password } })` | auth.controller | POST `/login` |
| `prisma.user.findUnique({ where: { id: req.user.userId } })` | auth.controller | GET/POST `/me` |
| `prisma.refreshToken.create` | auth.service | Login, refresh — store token hash |
| `prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user } })` | auth.service | POST `/refresh` |
| `prisma.refreshToken.delete` | auth.service | Refresh rotation, expired token cleanup |
| `prisma.refreshToken.deleteMany({ where: { tokenHash } })` | auth.service | Logout |
| `prisma.refreshToken.deleteMany({ where: { userId } })` | auth.service | `revokeAllUserRefreshTokens` (unused route) |
| `prisma.user.findUnique({ select: athlete fields })` | ssn.controller | POST `/analyze` — AI context |
| `prisma.session.create` | ssn.controller | POST `/analyze` |
| `prisma.session.findMany({ where: { userId } })` | ssn.controller | GET `/session` |
| `prisma.session.findFirst({ where: { id, userId }, include: chats })` | ssn.controller | GET `/session/:id` |
| `prisma.session.findFirst({ include: chats, user })` | ssn.controller | POST `/session/:id` follow-up |
| `prisma.chatMessage.create` (USER) | ssn.controller | POST `/session/:id` — before AI |
| `prisma.chatMessage.create` (ASSISTANT) | ssn.controller | POST `/session/:id` — after AI |
| `prisma.session.findFirst` | ssn.controller | DELETE `/session/:id` |
| `prisma.session.delete` | ssn.controller | DELETE `/session/:id` |
| `prisma.$queryRaw\`SELECT 1\`` | app.js | GET `/api/health` |

### Connection Setup and Pooling

File: `server/config/db.js`

```javascript
const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
```

- **Singleton pattern** in dev via `globalThis` — prevents hot-reload connection exhaustion
- **No explicit pool config** — Prisma uses connection pooling built into the query engine; for serverless, you'd typically use a pooled `DATABASE_URL` (e.g. Neon `?pgbouncer=true` or Prisma Accelerate)
- `binaryTargets: ["native", "rhel-openssl-3.0.x"]` in schema — required for Vercel's Linux runtime

---

## 5. AI Integration Pipeline

### Stance Analysis: Step by Step

```
User selects image + optional question (frontend)
        │
        ▼
POST /api/session/analyze (multipart/form-data)
        │
        ▼
Multer memoryStorage → req.file.buffer (max 10MB)
        │
        ▼
writeUploadToTemp() → /tmp/{timestamp}-{filename}
        │
        ▼
prisma.user.findUnique → athlete profile (sport, level, role, fullName)
        │
        ▼
analyzeStance(tempPath, question, athlete)
   ├─ buildCoachSystemInstruction(athlete)
   ├─ imageToGenerativePart(tempPath) → base64 inline image
   ├─ Gemini generateContent (jsonMode: true)
   │    ├─ responseMimeType: application/json
   │    ├─ responseSchema: COACHING_JSON_SCHEMA
   │    └─ temperature: 0.4
   └─ parseCoachingJson() → Zod validation
        │
        ▼
uploadImageToCloudinary(tempPath)
   └─ folder: "shadowCoach", returns secure_url
        │
        ▼
prisma.session.create({ imageUrl, scores, strengths, ... })
        │
        ▼
removeLocalUpload(tempPath) [finally block]
        │
        ▼
201 { session }
```

**Important ordering decision:** AI runs **before** Cloudinary upload. If Cloudinary fails after a successful AI call, the user gets `502` and no session is saved (no orphaned DB rows without images). Trade-off: you pay for AI compute even when upload fails.

### Cloudinary Configuration

**Init** (`config/cloudinary.js`):
```javascript
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
```

**Upload** (`storage.service.js`):
```javascript
cloudinary.uploader.upload(absolutePath, {
    folder: "shadowCoach",
    resource_type: "image",
});
```

**Returns (used fields):**
- `secure_url` → stored in `Session.imageUrl`
- `public_id` → derived on delete via URL parsing

**Delete:** `cloudinary.uploader.destroy(publicId)` when session is deleted. Failures are logged but do not block DB deletion.

### Gemini API — Model, Prompt, Parameters

**Provider selection:** `AI_PROVIDER` env (`gemini` default, or `grok`).

**Model chain** (`geminiModelChain`):
1. `GEMINI_MODEL` env (default `gemini-2.5-flash-lite`)
2. `GEMINI_FALLBACK_MODELS` comma-separated
3. Hardcoded fallbacks: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash-lite`

**Stance analysis call:**
- **System instruction:** `buildCoachSystemInstruction()` — ShadowCoach persona, sport-specific guidelines, athlete context
- **User parts:** `[{ text: userPrompt }, { inlineData: { data: base64, mimeType } }]`
- **JSON mode config:**
  - `temperature: 0.4`
  - `responseMimeType: "application/json"`
  - `responseSchema`: structured schema via `@google/generative-ai` `SchemaType`
- **Fallback:** On 429/404/quota errors, tries next model in chain

**Expected JSON shape (validated by Zod):**
```json
{
  "overallScore": 0-100,
  "strengths": ["...", "..."],
  "areasToImprove": ["...", "..."],
  "priorityFix": "...",
  "drillSuggestion": "...",
  "confidenceLevel": "LOW" | "MEDIUM" | "HIGH"
}
```

**Parsing:** `parseCoachingJson` — tries `JSON.parse`, falls back to regex extract `\{[\s\S]*\}`, then Zod `coachingResponseSchema.safeParse`.

### Grok Fallback (Optional)

If `AI_PROVIDER=grok`:
- Endpoint: `https://api.x.ai/v1/chat/completions`
- Model: `GROK_MODEL` (default `grok-2-vision-1212`)
- Image as `image_url` with base64 data URI or remote URL
- `response_format: { type: "json_object" }` for stance analysis

### How AI Responses Are Stored

| Field | Source |
|-------|--------|
| Structured columns | Parsed Zod output (`overallScore`, `strengths`, etc.) |
| `aiRawResponse` | Full `analyzeReport` spread + `question` field |
| `imageUrl` | Cloudinary `secure_url` (not AI) |

Chat messages stored separately in `ChatMessage` table.

### Chat AI vs Stance Analysis

| Aspect | Stance Analysis (`analyzeStance`) | Session Follow-Up (`sendSessionFollowUp`) |
|--------|-----------------------------------|-------------------------------------------|
| State | **Stateless** — single request, no DB chat read | **Stateful** — loads `chatHistory` + session analysis from DB |
| Output | Structured JSON (`jsonMode: true`) | Free-text prose (`jsonMode: false`) |
| Temperature | 0.4 | 0.6 |
| Image source | Local temp file path | Cloudinary URL (fetched remotely) |
| Persistence | Creates new `Session` row | Appends `ChatMessage` USER + ASSISTANT rows |
| Prompt context | Athlete profile only | Profile + initial analysis + prior chat transcript |

**Follow-up flow:**
1. Save user message to DB first
2. Build prompt with history block + analysis block + new question
3. Call `generateCoachingText` with `jsonMode: false`
4. Save assistant reply to DB
5. Return `{ reply: assistantMessage }`

### Error Handling Per Pipeline Step

| Step | Failure Mode | HTTP Status |
|------|--------------|-------------|
| No file / empty buffer | Controller check | 400 |
| Temp file write | Uncaught → catch | 500 |
| User not found | Controller | 404 |
| Missing `GEMINI_API_KEY` | Service throw | 500 |
| Gemini quota/404 | Model fallback chain, then throw | 500 |
| Invalid AI JSON | `parseCoachingJson` throw | 500 |
| Cloudinary 403/misconfig | Wrapped error with hint | 502 |
| DB create failure | catch | 500 |
| Temp file cleanup | `finally` — always runs | — |

---

## 6. Security Implementation

### Rate Limiters

| Limiter | Variable | windowMs | max/limit | Applied To | Message |
|---------|----------|----------|-----------|------------|---------|
| `generalLimiter` | `generalLimiter` | 15 min (900,000 ms) | 100 | All routes (global) | "Too many requests. Slow down." |
| `authLimiter` | `authLimiter` | 15 min | 10 | POST `/register`, POST `/login` | "Too many login attempts..." |
| `sessionCreationLimiter` | `sessionCreationLimiter` | 60 min (3,600,000 ms) | 5 | POST `/session/analyze` | "Analysis limit reached..." |

All use `standardHeaders: "draft-7"`, `legacyHeaders: false`, and `skip: (req) => req.method === "OPTIONS"` so preflight is not counted.

### CORS Configuration

File: `server/config/cors.js`

**Allowed origins (production):**
- `CLIENT_URL` env (comma-separated list)
- `https://${VERCEL_URL}` (auto on Vercel)
- Defaults: `localhost:5173`, `localhost:8080`, `localhost:3000`, `127.0.0.1` variants

**Options:**
```javascript
{
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}
```

**Dev:** `origin: true` — reflects requesting origin (any localhost port).

**Prod:** Custom `origin` callback — rejects unknown origins with error.

### Password Hashing

- Library: `bcryptjs`
- Rounds: **10** (`bcrypt.hash(password, 10)`)
- Location: `auth.controller.js` register only
- Compare: `bcrypt.compare(password, user.password)` on login
- Validation before hash: Zod `passwordvalidation` — min 8 chars, uppercase, lowercase, number, special from `!@#$%^&*`

### Input Validation

| Endpoint | Validator | What's Checked |
|----------|-----------|----------------|
| POST `/register` | Zod `registerSchema` | email, password rules, fullName 3–20, country/state, age 1–120, sport enum, level enum, role 1–50 |
| POST `/login` | Zod `loginSchema` | email format, password non-empty |
| POST `/session/analyze` | Manual | `req.file?.buffer` exists; optional `question` string |
| POST `/session/:id` | Manual | `req.body.message` non-empty trim |

**Not validated:** Image MIME type at middleware level (only size limit). AI service infers MIME from file extension.

### Environment Variables and Loading

- `import "dotenv/config"` at top of `app.js` and `ai.service.js`
- Secrets in `server/.env` (gitignored)
- Template in `server/.env.example`
- Frontend public config: `VITE_API_URL` via Vite `import.meta.env`

**Secrets (never expose to client):**
`DATABASE_URL`, `JWT_USER_SECRET`, `GEMINI_API_KEY`, `XAI_API_KEY`, Cloudinary credentials

---

## 7. Frontend ↔ Backend Connection

### API Client Setup

File: `frontend/src/lib/api/client.ts`

```typescript
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3000/api"),
  withCredentials: true,
});
```

| Environment | baseURL |
|-------------|---------|
| Dev (default) | `http://localhost:3000/api` |
| Dev (`.env`) | `VITE_API_URL` override |
| Production | `/api` (same-origin on Vercel) |

`withCredentials: true` sends httpOnly cookies on cross-origin and same-origin requests.

### Auth State Management

**No localStorage tokens.** Auth is entirely cookie-based.

1. **On app load:** `useAuth()` hook runs React Query `authApi.me()` → GET `/auth/me`
2. **On login:** Response `user` object cached in query key `["auth", "me"]`; cookies set by server
3. **On logout:** `authApi.logout()` → query cache set to `null`
4. **Protected routes:** `requireAuth()` in `beforeLoad` fetches `/auth/me` or redirects to `/login`
5. **Token refresh:** Transparent via Axios interceptor (user never sees it)

### Every Frontend API Call

| Function | Method | URL | Sends | Expects |
|----------|--------|-----|-------|---------|
| `authApi.register` | POST | `/auth/register` | JSON RegisterPayload | `{ message }` |
| `authApi.login` | POST | `/auth/login` | `{ email, password }` | `{ message, user }` + cookies |
| `authApi.logout` | POST | `/auth/logout` | — | `{ message }` |
| `authApi.refresh` | POST | `/auth/refresh` | — (refresh cookie) | `{ message, user }` |
| `authApi.me` | GET | `/auth/me` | — (access cookie) | `{ user }` |
| `sessionApi.analyze` | POST | `/session/analyze` | FormData: `image`, `question?` | `{ message, session }` |
| `sessionApi.list` | GET | `/session` | — | `{ sessions: SessionSummary[] }` |
| `sessionApi.get` | GET | `/session/:id` | — | `{ session: SessionDetail }` |
| `sessionApi.followUp` | POST | `/session/:id` | `{ message }` | `{ message, reply: ChatMessage }` |
| `sessionApi.delete` | DELETE | `/session/:id` | — | `{ message }` |

### Frontend Error Handling

`getApiErrorMessage(error)` in `lib/api/errors.ts`:
1. Axios `response.data.message` (string)
2. `response.data.error` (string)
3. JSON-stringify object errors
4. Fallback to `error.message` or generic string

UI surfaces errors via `toast.error()` (Sonner) on login, register, analyze, chat, delete.

**401 handling:**
- `useAuth` me query: returns `null` user (not an error toast)
- Axios interceptor: attempts refresh on `TOKEN_EXPIRED` only

### CORS ↔ Frontend Origin Relationship

| Dev | Frontend `http://localhost:8080` | Backend CORS `origin: true` | Cookies `sameSite: none` if `CLIENT_URL` set |
| Prod | `https://app.vercel.app` | Must be in `CLIENT_URL` or `VERCEL_URL` | Cookies `sameSite: lax`, same origin `/api` |

---

## 8. File Upload Flow

### Multer Configuration

File: `server/middleware/upload.middleware.js`

```javascript
const upload = multer({
    storage: multer.memoryStorage(),  // NOT disk storage
    limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB
});
```

- **Memory storage:** File stays in `req.file.buffer` (no automatic disk write)
- **Field name:** `image` (`upload.single("image")`)
- **No fileFilter:** Any file type accepted up to 10MB (no MIME whitelist)

### Temp File Bridge

Because Cloudinary SDK and Gemini read from file paths, the controller writes buffer to OS temp:

```javascript
function writeUploadToTemp(file) {
    const localPath = path.join(os.tmpdir(), `${Date.now()}-${file.originalname}`);
    fs.writeFileSync(localPath, file.buffer);
    return localPath;
}
```

Cleaned in `finally` via `fs.unlinkSync`.

### Multer → Cloudinary → DB

```
req.file.buffer
    → temp file on disk
    → AI analysis (reads temp path)
    → cloudinary.uploader.upload(absolutePath)
    → result.secure_url
    → Session.imageUrl in PostgreSQL
```

### What Cloudinary Returns vs What Gets Stored

Cloudinary `upload()` returns a rich object. This project only persists:
- **`secure_url`** → `Session.imageUrl` (HTTPS CDN URL displayed in UI)

On delete, `publicIdFromCloudinaryUrl()` parses the URL to extract `public_id` for `uploader.destroy()`.

---

## 9. Environment & Config

### Backend Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for Prisma |
| `JWT_USER_SECRET` | Yes | — | Signs and verifies access JWTs |
| `ACCESS_TOKEN_EXPIRES` | No | `15m` | JWT access token lifetime |
| `REFRESH_TOKEN_DAYS` | No | `7` | Refresh token DB expiry |
| `NODE_ENV` | No | `development` | Controls CORS, cookie secure, Prisma logging |
| `PORT` | No | `3000` | HTTP server port (local) |
| `CLIENT_URL` | Prod recommended | — | Comma-separated allowed CORS origins |
| `VERCEL` | Auto on Vercel | — | Same-origin cookie mode, trust proxy |
| `VERCEL_URL` | Auto on Vercel | — | Added to CORS allowlist |
| `SAME_ORIGIN` | No | — | Force same-origin cookie config if `"true"` |
| `AI_PROVIDER` | No | `gemini` | `gemini` or `grok` |
| `GEMINI_API_KEY` | Yes (if gemini) | — | Google AI API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash-lite` | Primary Gemini model |
| `GEMINI_FALLBACK_MODELS` | No | — | Comma-separated fallback models |
| `XAI_API_KEY` / `GROK_API_KEY` | If grok | — | xAI API key |
| `GROK_MODEL` | No | `grok-2-vision-1212` | Grok vision model |
| `CLOUDINARY_CLOUD_NAME` | Yes | — | Cloudinary account |
| `CLOUDINARY_API_KEY` | Yes | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | — | Cloudinary API secret |

### Frontend Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `VITE_API_URL` | Dev only | `http://localhost:3000/api` | Backend base URL |
| (prod) | — | `/api` | Same-origin relative path |

### `.env` Structure

**`server/.env`** (gitignored): All backend secrets and config above.

**`server/.env.example`**: Documented template without real values.

**`frontend/.env.example`**: Only `VITE_API_URL` for local dev.

### Dev vs Production Differences

| Concern | Development | Production |
|---------|-------------|------------|
| API URL | `http://localhost:3000/api` | `/api` on same domain |
| CORS | `origin: true` (permissive) | Strict allowlist |
| Cookies | `secure: false` (localhost) or `none` (cross-origin) | `secure: true`, `lax` (Vercel) |
| Trust proxy | Off | On (`trust proxy: 1`) |
| Prisma logs | `error`, `warn` | `error` only |
| Server entry | `node index.js` (long-running) | Express exported as serverless handler |
| Build | Separate terminals | `vercel-build.sh` unified output |

---

## 10. What Each Backend File Does

### `server/index.js`

Entry point for **local development and standalone deployment**. Imports the Express `app`, calls `app.listen(PORT)`, and logs CORS configuration on startup. Handles `EADDRINUSE` with a helpful kill command. **If removed:** You lose the ability to run a persistent HTTP server locally; Vercel production would still work via `api.func/index.mjs` importing `app.js` directly.

### `server/app.js`

The **core Express application**. Wires global middleware (CORS, rate limit, body parsers, cookies), mounts `/api/auth` and `/api/session` routers, exposes `/api/health`, and registers the global 500 error handler. Exported as default for Vercel serverless. **If removed:** The entire API ceases to exist.

### `server/package.json`

Defines server dependencies (Express, Prisma, bcrypt, JWT, multer, Gemini SDK, Cloudinary, Zod, rate-limit) and scripts (`start`, `postinstall` → prisma generate, `prisma:migrate`). **If removed:** No dependency management for the backend.

### `server/package-lock.json`

Locks exact dependency versions for reproducible installs. **If removed:** `npm install` may resolve different versions, risking subtle breakage.

### `server/.gitignore`

Ignores `node_modules/`, `.env`, `uploads/`, logs, and generated Prisma artifacts. **If removed:** Risk of committing secrets or bloating the repo.

### `server/.env.example`

Documents required environment variables without real secrets. Serves as onboarding template. **If removed:** New developers won't know which env vars to configure (no runtime impact).

### `server/config/cors.js`

Exports `getAllowedOrigins()` and `getCorsOptions()`. Implements dev-vs-prod CORS policies and credentials support. **If removed:** Browser clients cannot make authenticated cross-origin requests; the frontend would fail in dev.

### `server/config/cookies.js`

Centralizes cookie names (`token`, `refreshToken`) and environment-aware cookie options (httpOnly, secure, sameSite, maxAge). Used by auth controller and service for set/clear operations. **If removed:** Login/logout/refresh would break cookie setting; auth would fail.

### `server/config/db.js`

Creates a singleton `PrismaClient` with environment-appropriate logging and dev hot-reload protection via `globalThis`. **If removed:** No database access anywhere in the app.

### `server/config/cloudinary.js`

Loads dotenv and configures the Cloudinary v2 SDK with cloud name, API key, and secret. **If removed:** Image upload and delete would fail at SDK initialization.

### `server/config/.txt`

Developer notes file with sample registration JSON and assignment progress notes — **not loaded by the application**. Contains no runtime logic. **If removed:** No impact on the running system (documentation only).

### `server/middleware/auth.middleware.js`

Reads the `token` cookie, verifies the JWT, attaches decoded payload to `req.user`, or returns `401` with `TOKEN_EXPIRED` / `INVALID_TOKEN` codes. **If removed:** All protected routes would be publicly accessible or would need duplicate auth logic.

### `server/middleware/rateLimiter.js`

Defines three `express-rate-limit` instances: general (100/15min), auth (10/15min), session creation (5/hour). Skips OPTIONS preflight. **If removed:** API vulnerable to brute-force login and AI cost abuse.

### `server/middleware/upload.middleware.js`

Configures Multer with memory storage and 10MB file size limit. Exports default middleware for single `image` field. **If removed:** POST `/analyze` cannot accept multipart uploads.

### `server/routes/auth.js`

Express router mounting auth endpoints with appropriate limiters and `authmiddleware` on `/me`. Re-applies `express.json()` and `cookieParser()`. **If removed:** No registration, login, logout, refresh, or profile endpoints.

### `server/routes/session.js`

Express router for coaching session CRUD and analysis. Applies auth to all routes, rate limit + multer on analyze. **If removed:** Core product feature (stance analysis and chat) unavailable.

### `server/controllers/auth.controller.js`

Handles HTTP layer for auth: Zod validation, email normalization, bcrypt hashing/comparison, Prisma user queries, delegates token issuance to `auth.service`. **If removed:** Auth routes would have no handlers.

### `server/controllers/ssn.contoller.js`

Session controller (filename typo: "ssn" not "session"). Orchestrates analyze pipeline (temp file, AI, Cloudinary, DB), lists/gets/deletes sessions, manages chat follow-ups. Enforces `userId` ownership on all queries. **If removed:** No coaching session functionality.

### `server/services/auth.service.js`

Token cryptography: JWT sign/verify, refresh token generation, SHA-256 hashing, Prisma refresh token CRUD, rotation on refresh, revocation on logout. Exports `userProfileSelect` for consistent safe user fields. **If removed:** Login, refresh, and logout would break; auth middleware JWT verify would fail.

### `server/services/ai.service.js`

AI provider abstraction (Gemini primary, Grok optional). Builds coaching system prompts, converts images to model input (local file or remote URL), calls Gemini with JSON schema mode for stance analysis, conversational mode for follow-ups, parses/validates JSON with Zod, implements model fallback chain. **If removed:** The app's core value proposition (AI coaching) stops working.

### `server/services/storage.service.js`

Cloudinary upload with env validation and detailed 403 hints, URL-to-publicId parsing, best-effort image deletion. **If removed:** Images wouldn't be persisted to CDN; session records would lack `imageUrl`; delete wouldn't clean up cloud storage.

### `server/prisma/schema.prisma`

Single source of truth for database models, enums, relations, and Prisma client generation config (including Vercel binary target). **If removed:** Prisma client cannot generate; all DB operations fail.

### `server/prisma/migrations/migration_lock.toml`

Locks migration provider to PostgreSQL. Prevents accidental provider switches. **If removed:** Prisma migrate may refuse to run or behave inconsistently across environments.

### `server/prisma/migrations/20260527120424_init/migration.sql`

Initial SQL migration creating User, Session, ChatMessage tables and enums. **If removed:** Fresh database deploys would miss core tables.

### `server/prisma/migrations/20260529071431_add_refresh_tokens/migration.sql`

Adds RefreshToken table with unique hash index and user FK. **If removed:** Refresh token auth would fail on deploy; login would error when creating refresh tokens.

---

## Appendix A: Interview Quick Reference

### Tech Stack (One-Liner)

Express 5 + Prisma + PostgreSQL + JWT httpOnly cookies with refresh rotation + Multer + Cloudinary + Gemini + Zod validation + express-rate-limit, fronted by TanStack Start/React deployed on Vercel as a unified SSR + serverless API monorepo.

### Decisions Worth Defending

1. **httpOnly cookies over localStorage JWT** — XSS-resistant; `withCredentials` for cross-origin dev
2. **Refresh token rotation with hashed storage** — Stolen DB doesn't leak usable tokens; one-time refresh use
3. **AI before Cloudinary** — Avoids orphan DB sessions without images; accepts AI cost on upload failure
4. **Memory multer + temp files** — Keeps serverless diskless; temp path needed for Cloudinary SDK + Gemini file read
5. **JSON schema mode for stance, free text for chat** — Structured data for UI cards; natural language for conversation
6. **Service layer separation** — Controllers stay thin; AI and auth logic testable in isolation
7. **Unified Vercel deploy** — Same-origin `/api` simplifies cookies (lax vs none)
8. **Rate limit on AI endpoint** — Protects Gemini quota and Cloudinary costs (5 analyses/hour)

### Known Gaps / Future Improvements

- No MIME type validation on uploads
- No `revokeAllUserRefreshTokens` route (function exists, unused)
- Global error handler unused (controllers handle errors inline)
- Register doesn't auto-login
- `ssn.contoller.js` filename typo
- No connection pooler config documented for serverless cold starts
- Chat follow-up saves user message before AI — if AI fails, orphan USER message remains

---

## Appendix B: Local Development Commands

```bash
# Terminal 1 — Backend (port 3000)
npm run dev:server

# Terminal 2 — Frontend (port 8080)
npm run dev:frontend

# Database migrations (from server/)
cd server && npx prisma migrate dev

# Health check
curl http://localhost:3000/api/health
```

---

*Generated from codebase analysis of ShadowCoach. Last synced with repository state as of project review.*
