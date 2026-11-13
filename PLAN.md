# Bookshelf — Project Plan

A web app where an admin uploads books (`.cbr`, `.cbz`, `.pdf`, or loose images), the server converts them into a
common page-image format, and readers browse a library and read in the browser. Paid books show a free preview and
ask the reader to purchase to read the rest.

_Last updated: 2026-11-13_

Legend: ✅ built · 🟡 built but not fully verified · ⬜ not started · ❓ needs a decision from you

---

## 1. Summary

| Phase | What | Status |
|---|---|---|
| 0 | Project setup | ✅ |
| 1 | Upload and conversion | ✅ (see verification notes) |
| 2 | Library and reader UI | 🟡 built, never viewed in a real browser by me |
| 3 | Accounts and roles | ✅ |
| 4 | Hardening before money | ⬜ **do this before Phase 5** |
| 5 | Payments and purchases | ⬜ ❓ provider not chosen |
| 6 | Reader and account features | ⬜ |
| 7 | Admin tools | ⬜ |
| 8 | Catalogue features | ⬜ |
| 9 | Production deployment | ⬜ |
| 10 | Legal and launch | ⬜ |
| 11 | Later ideas | ⬜ |

---

## 2. How it works

```
Browser (React + Vite)  ──/api──►  Express API  ──►  MySQL (metadata, users)
                                        │
                                        └──►  storage/ on disk (page images, covers, thumbnails)
```

**Key principle: the server holds the content and enforces the paywall.** The browser never receives pages the
reader hasn't earned. Page images are served by an API route that checks access on every request, so locking pages
in the UI alone would be bypassable and is not relied on.

### Conversion pipeline
1. Admin uploads one archive/PDF or many images.
2. File type is detected from its first bytes (not the extension — many `.cbr` files are really ZIPs).
3. Pages are extracted (RAR via `node-unrar-js`, ZIP via `adm-zip`, PDF via `pdfjs-dist` + `@napi-rs/canvas`).
4. Pages are sorted in natural order (`page2` before `page10`), resized to max 1600px wide, saved as WebP.
5. First page becomes the cover. Thumbnails are generated on first request and cached.
6. The book flips from `processing` to `ready` (or `failed` with an error message).

### Tech stack
| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router |
| Backend | Node 22, Express 5, `multer`, `sharp`, `morgan` |
| Database | MySQL 8 via `mysql2` (no ORM yet) |
| Auth | bcrypt (`bcryptjs`), JWT in an httpOnly cookie, `express-rate-limit` |
| Storage | Local disk (`backend/storage`) |

---

## 3. What is built (Phases 0–3)

### Phase 0 — Setup ✅
- [x] `frontend/` (Vite + React + Tailwind) and `backend/` (Express) folders
- [x] Vite dev proxy: `/api` → `http://localhost:4000`
- [x] `.env` / `.env.example`, request logging with morgan

### Phase 1 — Upload and conversion ✅
- [x] `.cbz`/ZIP, `.cbr`/RAR, `.pdf`, and loose images (multi-select)
- [x] Background conversion with status (`processing` / `ready` / `failed`)
- [x] WebP pages + cover + lazily generated thumbnails
- [x] PDF pages rendered on a white background (checked on a generated PDF)
- [x] Free-preview rule per book (`free_pages`, price in cents)
- [x] Paywalled page and thumbnail routes (403 for locked pages)

### Phase 2 — Library and reader UI 🟡
- [x] Dark theme, violet accent, responsive layout
- [x] Library: search, All/Free/Premium filter, skeleton loading, empty states, price badges
- [x] Upload modal: drag-and-drop, file list, title/author, price toggle, free-preview pages, real upload progress, cancel
- [x] Drop files anywhere on the library page (admin only)
- [x] Reader: auto-hiding toolbars, single/double page, fit width/height, zoom 50–400%, RTL (manga) mode, fullscreen
- [x] Reader: progress slider with a marker where the free preview ends, thumbnail drawer, keyboard shortcuts (`?`), swipe, edge-tap navigation
- [x] Reader: locked-page screen with "Sign in to purchase" / "Buy" (buy is disabled until Phase 5)
- [x] Reading position and view preferences remembered in the browser (`localStorage`)

### Phase 3 — Accounts and roles ✅
- [x] Signup: username, email, password, confirm password
- [x] Username and email unique, case-insensitive; clear per-field errors
- [x] Login with username + password; same error for wrong password and unknown user
- [x] Session cookie: httpOnly, SameSite=Lax, `secure` in production, 7 days
- [x] Rate limit on login/signup (30 per 15 min per IP)
- [x] Roles `user` / `admin`; role can't be set through signup
- [x] Admin-only upload and delete (enforced on the server; UI hides the controls)
- [x] `node create-admin.js` seeds a default admin (`admin` / `admin123`, **dev only**, refuses in production)

### What was actually tested
- **Auth, roles, upload/delete permissions:** exercised with real HTTP requests against your MySQL (all passed).
- **ZIP-based `.cbr`, PDF conversion:** run through the real converter with generated files.
- **Your own uploads** (two books, 29 pages each) converted successfully, so the pipeline works on real files.
- **Frontend:** builds and lints. **Not verified by me:** how it looks and feels in a browser (spread alignment, swipe,
  zoom scrolling, the upload modal, mobile layout). Please click through it and report anything off.
- **Not tested:** a real RAR-compressed `.cbr` specifically (yours may have been ZIP), very large files, odd PDFs
  (scanned, huge page size, encrypted).

---

## 4. What is remaining

### Phase 4 — Hardening before taking money ⬜
These matter more once real money and other people's accounts are involved.
- [ ] **Conversion survives restarts.** Today conversion runs inside the web process; if the server restarts mid-way
      the book stays on "processing" forever. Add a job queue (or at least a startup sweep that marks stuck books failed/retries them).
- [ ] **Zip-bomb / oversized-input protection:** cap extracted size, file count, and image dimensions; reject nested archives.
- [ ] **Upload validation:** verify real image content (not just extension), limit file sizes sensibly (currently 1 GB per file).
- [ ] **Security headers:** add `helmet`; set `trust proxy` correctly behind a reverse proxy so rate limiting and `secure` cookies work.
- [ ] **Rate limiting** on page/thumbnail routes too (scraping protection), and move the limiter to a shared store (Redis) if running multiple servers.
- [ ] **Change password** and **forgot/reset password** (needs email — see Phase 9). Until then the default admin password can only be changed in the DB.
- [ ] **Email verification** on signup (stops fake/typo emails; needed for receipts).
- [ ] Session revocation: logging out only clears the cookie; a stolen token stays valid until it expires. Add a token version or short-lived tokens + refresh.
- [ ] Automated tests for auth, access rules, and the converter (none exist yet).
- [ ] Centralised input validation (e.g. `zod`) instead of hand-written checks.
- [ ] Proper DB migrations (a migration tool) instead of the startup `ALTER TABLE` checks.

### Phase 5 — Payments and purchases ⬜ ❓
Needs your decision: **Stripe or Razorpay** (Razorpay is the usual choice for India; Stripe for most other regions).
- [ ] `purchases` table (user, book, amount, currency, provider id, status, timestamps)
- [ ] Checkout using the provider's hosted page (we never touch card numbers)
- [ ] **Webhook is the only thing that unlocks a book** — never trust the browser redirect. Verify signatures, make it idempotent.
- [ ] Replace `hasPurchased()` in `backend/src/access.js` (the one place the paywall rule lives)
- [ ] `readablePages` in the book API becomes per-user (full book once purchased)
- [ ] "My library" / purchased books, order history, receipts by email
- [ ] Refund handling (revoke or keep access? your policy), failed/abandoned payments
- [ ] Test mode first with the provider's test cards; only then live keys
- [ ] ❓ Currency: prices are currently shown as `$` and stored in cents. Pick the real currency(ies).

### Phase 6 — Reader and account features ⬜
- [ ] Reading progress stored on the server per user (currently per browser) → resume on any device
- [ ] "Continue reading" row on the library page
- [ ] Bookmarks / favourites / wishlist
- [ ] Profile page (change email/password, delete account)
- [ ] Reader polish found during real use: wide-page handling in double-page mode, continuous vertical scroll mode (webtoons), better pinch-zoom on touch

### Phase 7 — Admin tools ⬜
- [ ] Edit a book after upload: title, author, description, price, free-preview pages (right now these are set once at upload)
- [ ] Replace/upload a custom cover (currently always page 1)
- [ ] Reorder, delete, or replace individual pages
- [ ] Retry failed conversions from the UI
- [ ] Manage users: list, promote/demote admin, disable accounts
- [ ] Sales dashboard (revenue, per-book purchases)
- [ ] Draft / published / unpublished state so you can upload without showing it immediately

### Phase 8 — Catalogue features ⬜
- [ ] Server-side search and pagination (the library currently loads and filters everything in the browser — fine for dozens of books, not thousands)
- [ ] Categories/tags/genres, series and volume numbers
- [ ] Book detail page (description, preview, price, buy button) before opening the reader
- [ ] Sorting (newest, popular, price)
- [ ] ❓ EPUB / text books: a separate reflowable reader (PDF and comics are fixed page images)

### Phase 9 — Production deployment ⬜
- [ ] Hosting for frontend (static) and backend (Node); HTTPS; domain
- [ ] **Move images to object storage** (S3 / Cloudflare R2) with signed URLs and a CDN, instead of local disk
- [ ] Managed MySQL with automated backups; tested restore
- [ ] Transactional email service (verification, reset, receipts)
- [ ] Production env config (strong `JWT_SECRET`, `NODE_ENV=production`, real DB user, no default admin)
- [ ] Logging and error tracking (e.g. Sentry), uptime monitoring
- [ ] CI: lint + tests + build on every push
- [ ] Git repository (this folder is not under version control yet — set it up now, with `.env` and `storage/` ignored)

### Phase 10 — Legal and launch ⬜
- [ ] Terms of Service, Privacy Policy, refund policy, cookie notice
- [ ] Copyright / takedown (DMCA-style) process and contact address
- [ ] Tax: sales tax / VAT / GST collection (Stripe Tax or your own handling)
- [ ] Beta with a few real users, then public launch

### Phase 11 — Later ideas ⬜
- [ ] Installable web app (PWA) and offline reading for purchased books
- [ ] Multiple sellers/authors with revenue split and payouts (Stripe Connect / Razorpay Route) — see questions below
- [ ] Reviews and ratings, recommendations
- [ ] Gift purchases, discounts/coupons, bundles, subscriptions
- [ ] Localisation (multiple languages)

---

## 5. Things you haven't mentioned yet (worth deciding)

1. **Rights to the content.** Selling or even hosting comics/books requires that you own them or have a licence. This
   is the biggest business risk, bigger than any technical item. Decide where the books come from before launch.
2. **"Payout" — which did you mean?** I assumed *customers paying you*. If you meant *paying authors/sellers a share*,
   that is a much bigger feature (multiple seller accounts, KYC, revenue splits, payout schedules, tax forms). It changes the
   data model, so decide early even if you build it later.
3. **Piracy and content protection.** Anything displayed in a browser can be screenshotted or downloaded. We keep
   unpaid pages off the client entirely (strong), but paid pages can still be copied by a paying user. Options: per-user
   watermark, rate limiting on page requests, expiring page URLs. There is no perfect solution; choose how much it matters.
4. **Refund and access policy** after purchase (can a refunded user keep reading? lifetime access vs rental?).
5. **Pricing model:** per-book only, or subscription / rental / bundles later? This affects the `purchases` table design.
6. **Currency, tax and region.** Where are your customers and where are you registered? This decides the payment provider.
7. **Age/content ratings** if any books are mature.
8. **Accessibility and SEO.** Public book pages that search engines can index need server-side rendering or prerendering;
   the current single-page app does not do this. Alt text and keyboard support exist for the reader but haven't been audited.
9. **Storage and cost growth.** 100 comics × ~30 MB of WebP pages adds up; thumbnails and covers add more. Object storage
   plus a CDN keeps this cheap and fast.
10. **Backups of uploaded originals.** We currently delete the original upload after converting. If you ever want to
    re-convert at higher quality, or recover from a bug, keep the originals (in cheap storage).
11. **Admin account safety.** The seeded `admin` / `admin123` is for local development only. Change it before anyone
    else can reach the site, and consider two-factor authentication for admins later.
12. **Data protection.** Storing emails and purchase history brings GDPR-style duties (export/delete account, privacy policy).

---

## 6. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Where the paywall is enforced | Server, per page request | UI-only locking is trivially bypassed |
| Internal book format | Ordered WebP page images | One reader works for every input format |
| Auth | Username + password, JWT in httpOnly cookie | Not readable by page scripts; works with the Vite proxy as one origin |
| Admin creation | Script, not a signup page | Nobody can become admin through the app |
| PDF rendering | `pdfjs-dist` + `@napi-rs/canvas` | Permissive licences, no system install; avoids AGPL `mupdf` |
| DB access | Raw `mysql2` queries | Small schema so far; revisit if it grows |
| Conversion | In-process background task | Simple to start; **to be replaced by a queue (Phase 4)** |
| Prices | Integer cents | Avoids floating-point money bugs |

---

## 7. Data model (current)

- **users** — `id`, `username` (unique), `email` (unique), `password_hash`, `role` (`user`/`admin`), `created_at`
- **books** — `id`, `title`, `author`, `description`, `price_cents`, `free_pages`, `page_count`, `status`
  (`processing`/`ready`/`failed`), `error`, `owner_id` (uploader), `created_at`
- **pages** — `id`, `book_id`, `number`, `width`, `height` (images live on disk at `storage/books/<id>/<n>.webp`)
- _Planned:_ `purchases`, `reading_progress`, `bookmarks`, `categories`/`book_categories`, `audit_log`

## 8. API (current)

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | public (rate limited) |
| GET | `/api/auth/me` | public (returns `null` if signed out) |
| GET | `/api/books`, `/api/books/:id`, `/api/books/:id/cover` | public |
| GET | `/api/books/:id/pages/:n`, `/api/books/:id/pages/:n/thumb` | public for free pages; locked pages return 403 |
| POST | `/api/books` | admin |
| DELETE | `/api/books/:id` | admin |
| GET | `/api/health` | public |

## 9. Running it locally

1. **MySQL:** create the database and a user (in Workbench):
   ```sql
   CREATE DATABASE IF NOT EXISTS cbr_reader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'cbr_user'@'localhost' IDENTIFIED BY 'your-password';
   GRANT ALL PRIVILEGES ON cbr_reader.* TO 'cbr_user'@'localhost';
   ```
2. **Backend:** copy `backend/.env.example` to `backend/.env`, fill in `DB_USER`, `DB_PASSWORD`, and a random
   `JWT_SECRET` (32+ chars). Then `cd backend && npm install && npm run dev` (port 4000). Tables are created automatically.
3. **Admin:** `cd backend && node create-admin.js` → sign in as `admin` / `admin123`.
4. **Frontend:** `cd frontend && npm install && npm run dev` → http://localhost:5173

## 10. Known issues and rough edges

- Two lint warnings about setting state inside effects (loading data on mount) — harmless, easy to tidy.
- A server restart during conversion leaves that book stuck on "processing" (Phase 4).
- Books uploaded before accounts existed have no `owner_id`; admins can still delete them.
- Library loads every book at once; fine for small catalogues only (Phase 8).
- The Buy button is a disabled placeholder until payments exist.
- Original uploads are deleted after conversion.
- No automated tests, no CI, and the project is not in git yet.

## 11. Suggested order from here

1. **Click through the UI** and send me anything that looks or feels wrong (quick fixes before building more on top).
2. **Phase 4 essentials:** conversion queue/restart recovery, zip-bomb limits, `helmet`, change-password, git repo + tests.
3. **Decide:** payment provider, currency, refund policy, and what "payout" means → then **Phase 5**.
4. **Phases 6–8** in whatever order your users ask for.
5. **Phases 9–10** before showing it to the public.
