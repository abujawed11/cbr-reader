# Bookshelf — Project Plan

A web app where an admin uploads books (`.cbr`, `.cbz`, `.pdf`, or loose images), the server converts them into a
common page-image format, and readers browse a library and read in the browser. Paid books show a free preview and
ask the reader to purchase (via Razorpay) to read the rest.

_Last updated: 2026-11-13 (after Phase 6 build, in progress)_

Legend: ✅ built · 🟡 built, being tested or not fully verified · ⬜ not started · ❓ needs a decision from you

---

## 1. Summary

| Phase | What | Status |
|---|---|---|
| 0 | Project setup | ✅ |
| 1 | Upload and conversion | ✅ |
| 2 | Library and reader UI | 🟡 built; you are using it, so feedback welcome |
| 3 | Accounts and roles | ✅ |
| 4 | Hardening | ⏭ **skipped for now by choice** (still recommended before launch) |
| 5 | Payments and purchases (Razorpay) | 🟡 **built, you are testing it through the UI** |
| 6 | Reader and account features | ✅ |
| 7 | Admin tools | ⬜ |
| 8 | Catalogue features | ⬜ |
| 9 | Production deployment | ⬜ |
| 10 | Legal and launch | ⬜ |
| 11 | Later ideas | ⬜ |

**Where we are right now:** Phase 6 is complete. **The next step is you completing a test payment in the UI** (Phase 5's
last open item), or picking a Phase 7/8 feature, or the starred Phase 4 hardening items — your call.

---

## 2. How it works

```
Browser (React + Vite) ──/api──► Express API ──► MySQL (users, books, pages, purchases)
        │                             │
        │                             └──► storage/ on disk (page images, covers, thumbnails)
        │
        └── Razorpay Checkout popup ◄──► Razorpay ──webhook──► Express API
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

### Purchase flow
1. Reader clicks **Buy** → `POST /api/payments/orders` with only the book id. **The server prices the order from its
   own database**; the browser can't change the amount. A `purchases` row is created with status `created`.
2. The Razorpay Checkout popup opens (loaded from `checkout.razorpay.com`); the reader pays.
3. The popup returns a signed receipt → `POST /api/payments/verify`. The server checks the HMAC signature, confirms
   the order belongs to the signed-in user, **fetches the payment from Razorpay and checks order id, amount and
   currency**, captures it if it is only "authorized", then marks the purchase `paid`. The book unlocks immediately.
4. **Safety net:** Razorpay also calls our `/api/payments/webhook` (signature-verified over the raw body). If the
   reader closed the tab before step 3, the webhook still unlocks the book. Both paths are idempotent.
5. A fully refunded payment (webhook `refund.processed`) flips the purchase to `refunded` and access is removed.

Who can read what (`backend/src/access.js`, the single place for this rule):
- **Free books:** everyone.
- **Paid books:** the first `free_pages` pages for everyone; every page for **buyers** and **admins**.

### Tech stack
| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router |
| Backend | Node 22, Express 5, `multer`, `sharp`, `morgan` |
| Database | MySQL 8 via `mysql2` (no ORM yet) |
| Auth | bcrypt (`bcryptjs`), JWT in an httpOnly cookie, `express-rate-limit` |
| Payments | Razorpay (Orders API + hosted Checkout popup + webhooks), currency INR |
| Storage | Local disk (`backend/storage`) |

---

## 3. What is built

### Phase 0 — Setup ✅
- [x] `frontend/` (Vite + React + Tailwind) and `backend/` (Express) folders
- [x] Vite dev proxy: `/api` → `http://localhost:4000`
- [x] `.env` / `.env.example`, request logging with morgan

### Phase 1 — Upload and conversion ✅
- [x] `.cbz`/ZIP, `.cbr`/RAR, `.pdf`, and loose images (multi-select)
- [x] Background conversion with status (`processing` / `ready` / `failed`)
- [x] WebP pages + cover + lazily generated thumbnails
- [x] PDF pages rendered on a white background
- [x] Free-preview rule per book (`free_pages`)
- [x] Paywalled page and thumbnail routes (403 for locked pages)
- Verified: your own uploaded books converted successfully; ZIP-based `.cbr` and PDF tested with generated files.

### Phase 2 — Library and reader UI 🟡
- [x] Dark theme, violet accent, responsive layout
- [x] Library: search, All/Free/Premium filter, skeleton loading, empty states, price badges (₹), **"Owned" badge**
- [x] Upload modal (admin): drag-and-drop, file list, title/author, price (₹ INR), free-preview pages, upload progress, cancel
- [x] Drop files anywhere on the library page (admin only)
- [x] Reader: auto-hiding toolbars, single/double page, fit width/height, zoom, RTL (manga) mode, fullscreen
- [x] Reader: progress slider with a marker where the free preview ends, thumbnail drawer, keyboard shortcuts (`?`), swipe, edge-tap navigation
- [x] Reader: locked-page screen with a working **Buy** button (or "Sign in to purchase" when signed out)
- [x] Reader: success / error banner after a payment attempt
- [x] Reading position and view preferences remembered in the browser (`localStorage`)

### Phase 3 — Accounts and roles ✅
- [x] Signup: username, email, password, confirm password; username and email unique (case-insensitive); per-field errors
- [x] Login with username + password; same error for wrong password and unknown user
- [x] Session cookie: httpOnly, SameSite=Lax, `secure` in production, 7 days
- [x] Rate limit on login/signup (30 per 15 min per IP)
- [x] Roles `user` / `admin`; role can't be set through signup; admin-only upload and delete (enforced on the server)
- [x] `node create-admin.js` (run from `backend/`) seeds `admin` / `admin123` — **dev only**, refuses when `NODE_ENV=production`

### Phase 5 — Payments and purchases (Razorpay) 🟡
Built:
- [x] `purchases` table (user, book, amount, currency, Razorpay order/payment ids, status `created`/`paid`/`failed`/`refunded`);
      rows survive book deletion (`book_id` becomes NULL, `book_title` is a snapshot)
- [x] `POST /api/payments/orders` — server-side pricing, blocks free books, admins, and already-owned books
- [x] `POST /api/payments/verify` — signature check, ownership check, Razorpay lookup (order/amount/currency), auto-capture of authorized payments
- [x] `POST /api/payments/webhook` — raw-body signature check; handles `payment.captured`, `order.paid`, `refund.processed`/`refund.created`; ignores amount mismatches
- [x] `GET /api/payments/mine` — signed-in user's order history (endpoint only, no UI page yet)
- [x] Access rule updated: buyers and admins read the whole book; book API returns `purchased`, `currency` and a per-viewer `readablePages`
- [x] Minimum paid price enforced (₹1, Razorpay's minimum) and rate limit on payment routes
- [x] Payments return a clear 503 "not set up yet" if keys are missing, instead of crashing the app

Tested with fake keys and hand-signed requests (before you took over testing): paywall per viewer, bad/missing signatures
rejected, wrong-amount webhook ignored, correct webhook unlocks, replay is harmless, another account can't claim your
order, refund re-locks, owned/free/admin cases for order creation.

**Not yet verified (this is what your UI test covers):**
- [ ] Full real payment in the popup (test card / UPI) ending in an unlocked book
- [ ] The `verify` call against real Razorpay (`payments.fetch`, and `capture` if your account is manual-capture)
- [ ] Failed / cancelled payment messages in the UI
- [ ] Real webhook delivery from Razorpay (needs a public URL — see §9)
- [ ] A real refund from the dashboard re-locking the book

Still to do in Phase 5:
- [x] "My library" page in the UI (Phase 6)
- [ ] Order-history page in the UI (the `GET /api/payments/mine` endpoint exists; no page reads it yet)
- [ ] Receipt emails (needs email service, Phase 9)
- [ ] Decide refund/access policy (currently: full refund removes access; partial refunds are ignored) ❓
- [ ] Go-live: Razorpay KYC, live keys, live webhook

### Phase 6 — Reader and account features ✅
- [x] Reading progress stored on the server per user (`reading_progress` table, debounced save while reading; falls
      back to `localStorage` for guests)
- [x] "Continue reading" row on the library home (signed-in, in-progress books, most recent first)
- [x] "My library" page (`/my-library`) listing purchased books
- [x] Favourites: heart toggle on every cover, `/favorites` page, `favorites` table
- [x] Account settings page (`/profile`): change email, change password, delete account (password-confirmed; refused
      if the account has purchase history, since those rows are kept as financial records)
- [x] Reader polish: pinch-zoom (two-finger touch), continuous scroll / webtoon mode (toggle + `W` shortcut, tracks
      the most-visible page for the slider/progress)
- [x] Reader polish: wide pages (landscape double-spreads scanned as one image) now stand alone in double-page mode
      instead of being paired with a neighbor — `GET /api/books/:id` reports `widePages` from each page's stored
      width/height, and the reader builds spreads around them

Not yet tried with a real wide page in your own library — worth a quick look next time you read a book that has one.

---

## 4. What is remaining

### Phase 4 — Hardening ⏭ skipped for now
Skipped by your choice to move on to payments. **Do at least the starred items before real customers or real money.**
- [ ] ★ **Conversion survives restarts.** Conversion runs inside the web process; a restart mid-way leaves the book on "processing" forever. Add a job queue, or a startup sweep that fails/retries stuck books.
- [ ] ★ **Zip-bomb / oversized-input protection:** cap extracted size, file count, image dimensions; reject nested archives.
- [ ] ★ **Change password** and **forgot/reset password** (needs email). Until then the default admin password can only be changed in the DB.
- [ ] ★ **Security headers:** `helmet`; set `trust proxy` correctly behind a reverse proxy so rate limiting and `secure` cookies work.
- [ ] ★ Git repository + automated tests (auth, access rules, payments, converter). None exist yet; the project is not under version control.
- [ ] Upload validation: verify real image content, sensible size limits (currently 1 GB per file).
- [ ] Rate limiting on page/thumbnail routes (scraping), shared store (Redis) if running several servers.
- [ ] Email verification on signup (needed for receipts).
- [ ] Session revocation (logout only clears the cookie; a stolen token stays valid until it expires).
- [ ] Centralised input validation (e.g. `zod`) and a real DB migration tool (currently startup `ALTER TABLE` checks).
- [ ] Rename `books.price_cents` → `price_minor` (the column now holds paise; the name is historical).

### Phase 7 — Admin tools ⬜
- [ ] Edit a book after upload: title, author, description, price, free-preview pages (currently set once at upload)
- [ ] Replace/upload a custom cover (currently always page 1)
- [ ] Reorder, delete, or replace individual pages; retry failed conversions
- [ ] Manage users: list, promote/demote admin, disable accounts
- [ ] Sales dashboard (revenue, purchases per book); refund from the app
- [ ] Draft / published state

### Phase 8 — Catalogue features ⬜
- [ ] Server-side search and pagination (the library currently loads everything)
- [ ] Categories/tags, series and volume numbers, sorting
- [ ] Book detail page (description, preview, price, buy) before opening the reader
- [ ] ❓ EPUB / text books: separate reflowable reader

### Phase 9 — Production deployment ⬜
- [ ] Hosting (static frontend + Node backend), HTTPS, domain
- [ ] Move images to object storage (S3 / R2) with signed URLs and a CDN
- [ ] Managed MySQL with automated backups and a tested restore
- [ ] Transactional email (verification, reset, receipts)
- [ ] Production env: strong `JWT_SECRET`, `NODE_ENV=production`, dedicated DB user, **no default admin**, live Razorpay keys
- [ ] Logging, error tracking (Sentry), uptime monitoring, CI (lint + tests + build)

### Phase 10 — Legal and launch ⬜
- [ ] Terms, Privacy Policy, **refund/cancellation policy** (Razorpay requires these on your site for live mode — your `seedr-lite` has templates you can adapt), cookie notice
- [ ] Copyright / takedown process and contact address
- [ ] Tax: GST invoicing/collection
- [ ] Razorpay live-mode KYC and activation; beta with a few users; public launch

### Phase 11 — Later ideas ⬜
- [ ] PWA / offline reading for purchased books
- [ ] Multiple sellers with revenue split and payouts (Razorpay Route) — see questions below
- [ ] Reviews, recommendations, gifts, coupons, bundles, subscriptions, multiple languages

---

## 5. Things worth deciding (not yet discussed)

1. **Rights to the content.** Selling or hosting comics/books requires owning them or having a licence. This is the
   biggest business risk. Decide where the books come from before launch.
2. **"Payout" — which did you mean?** I built *customers paying you*. If you meant *paying authors/sellers a share*, that
   is a much bigger feature (seller accounts, KYC, splits, payout schedules). It changes the data model, so decide early.
3. **Piracy and content protection.** Unpaid pages never reach the browser (strong), but a paying user can still
   screenshot or copy pages. Options: per-user watermark, rate limits, expiring URLs. No perfect solution.
4. **Refund and access policy:** keep or revoke access after refund (currently revoked), lifetime access vs rental.
5. **Pricing model:** per-book only for now. Subscriptions/rentals/bundles would change the `purchases` design.
6. **Currency:** INR only for now. Selling to other countries needs international payments enabled on your Razorpay account and multi-currency pricing.
7. **Age/content ratings** if any books are mature.
8. **Accessibility and SEO.** Public book pages that search engines can index need server-side rendering or prerendering.
9. **Storage cost growth.** Object storage plus a CDN keeps it cheap and fast.
10. **Original uploads are deleted after conversion.** Keep them (cheap storage) if you may want to re-convert later.
11. **Admin account safety.** `admin` / `admin123` is for local development only. Change it before anyone else can reach the site; consider 2FA for admins.
12. **Data protection.** Emails and purchase history bring privacy duties (export/delete account, privacy policy).

---

## 6. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Where the paywall is enforced | Server, per page request | UI-only locking is trivially bypassed |
| Internal book format | Ordered WebP page images | One reader works for every input format |
| Auth | Username + password, JWT in httpOnly cookie | Not readable by page scripts; one origin via the Vite proxy |
| Admin creation | Script (`node create-admin.js`), not a signup page | Nobody can become admin through the app |
| Who can upload/delete | Admins only; normal users read and buy | Store model |
| Payment provider | Razorpay (Orders API + Checkout popup) | Your choice; you already used this pattern in `seedr-lite` |
| What unlocks a book | Server-verified payment (signature + Razorpay lookup), plus webhook as backup | Never trust the browser alone |
| Price source | Our database, never the request | Prevents price tampering |
| Prices | Integer minor units (paise) | Avoids floating-point money bugs |
| Refund | Full refund removes access | Standard default; easy to change |
| PDF rendering | `pdfjs-dist` + `@napi-rs/canvas` | Permissive licences, no system install; avoids AGPL `mupdf` |
| Conversion | In-process background task | Simple to start; to be replaced by a queue (Phase 4) |
| Phase 4 | Skipped for now | Your call; starred items recommended before launch |
| Account deletion with purchase history | Refused (409), asks the user to contact support | Purchase rows are kept as financial records, same reasoning as the book-deletion snapshot pattern |
| Reading progress source of truth | Server (signed in) with `localStorage` fallback (guests) | Follows the reader across devices; guests still get something without an account |
| Favourites vs. bookmarks | Built favourites (book-level) first; per-page bookmarks still planned | Favourites covers the more common "save for later" case with less design surface |

---

## 7. Data model (current)

- **users** — `id`, `username` (unique), `email` (unique), `password_hash`, `role` (`user`/`admin`), `created_at`
- **books** — `id`, `title`, `author`, `description`, `price_cents` (minor units; 0 = free), `free_pages`, `page_count`,
  `status` (`processing`/`ready`/`failed`), `error`, `owner_id` (uploader), `created_at`
- **pages** — `id`, `book_id`, `number`, `width`, `height` (images on disk at `storage/books/<id>/<n>.webp`)
- **purchases** — `id`, `user_id`, `book_id` (nullable), `book_title`, `amount`, `currency`, `razorpay_order_id` (unique),
  `razorpay_payment_id`, `status` (`created`/`paid`/`failed`/`refunded`), `created_at`, `paid_at`
- **reading_progress** — `user_id`, `book_id`, `page`, `updated_at` (one row per reader per book)
- **favorites** — `user_id`, `book_id`, `created_at`
- _Planned:_ `bookmarks` (per-page, distinct from favourites), `categories`/`book_categories`, `audit_log`

## 8. API (current)

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/signup`, `/login`, `/logout` | public (rate limited) |
| GET | `/api/auth/me` | public (`null` if signed out) |
| GET | `/api/books`, `/api/books/:id`, `/:id/cover` | public (responses depend on who is asking: `purchased`, `readablePages`, `lastPage`, `favorited`) |
| GET | `/api/books/:id/pages/:n`, `/:id/pages/:n/thumb` | free pages: public · locked pages: buyers and admins only (else 403) |
| POST | `/api/books` | admin |
| DELETE | `/api/books/:id` | admin |
| PUT | `/api/books/:id/progress` | signed in |
| PUT`/`DELETE | `/api/books/:id/favorite` | signed in |
| PUT | `/api/auth/email`, `/api/auth/password` | signed in (rate limited) |
| DELETE | `/api/auth/me` | signed in, password-confirmed (rate limited; refused if the account has purchase history) |
| POST | `/api/payments/orders` | signed in |
| POST | `/api/payments/verify` | signed in (owner of the order) |
| GET | `/api/payments/mine` | signed in |
| POST | `/api/payments/webhook` | Razorpay only (HMAC signature) |
| GET | `/api/health` | public |

## 9. Running it locally

1. **MySQL:** create the database and a user (Workbench):
   ```sql
   CREATE DATABASE IF NOT EXISTS cbr_reader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'cbr_user'@'localhost' IDENTIFIED BY 'your-password';
   GRANT ALL PRIVILEGES ON cbr_reader.* TO 'cbr_user'@'localhost';
   ```
2. **Backend env:** copy `backend/.env.example` to `backend/.env` and set:
   ```
   DB_USER=...  DB_PASSWORD=...  DB_NAME=cbr_reader
   JWT_SECRET=<random string, 32+ chars>
   CURRENCY=INR
   RAZORPAY_KEY_ID=rzp_test_...        # Dashboard > Account & Settings > API Keys (Test mode)
   RAZORPAY_KEY_SECRET=...             # never put this in the frontend or in git
   RAZORPAY_WEBHOOK_SECRET=...         # optional for first tests; see below
   ```
   Then `cd backend && npm install && npm run dev` (port 4000). Tables are created/migrated automatically.
   The terminal must say `API listening on http://localhost:4000`; if it says the port is in use, another copy is still running.
3. **Admin:** `cd backend && node create-admin.js` → sign in as `admin` / `admin123`.
4. **Frontend:** `cd frontend && npm install && npm run dev` → http://localhost:5173
5. **Test a purchase:** as admin add a book with "Charge for this book" on (e.g. ₹49, 3 free pages). Then sign out, sign up
   as a normal user (admins can't buy), read to the end of the preview, click **Buy**. In test mode use a Razorpay test card
   (e.g. `4111 1111 1111 1111`, any future expiry, any CVV) or UPI `success@razorpay`.
6. **Webhook (optional, for the "closed the tab" safety net):** Razorpay can't reach `localhost`, so expose it with e.g.
   `cloudflared tunnel --url http://localhost:4000`, then in the Razorpay Dashboard add a webhook at
   `https://<tunnel>/api/payments/webhook` for `payment.captured`, `order.paid`, `refund.processed`, and put its secret
   in `RAZORPAY_WEBHOOK_SECRET`. A free tunnel URL changes every time you restart it.

## 10. Known issues and rough edges

- **Phase 5 has not yet been confirmed end-to-end with a real payment** (your test in progress).
- Two lint warnings about setting state inside effects (loading data on mount) — harmless.
- A server restart during conversion leaves that book stuck on "processing" (Phase 4).
- Books uploaded before accounts existed have no `owner_id`; admins can still delete them.
- Library loads every book at once; fine for small catalogues only (Phase 8).
- There are leftover `created` purchase rows for abandoned checkouts (normal; they never unlock anything). No cleanup job yet.
- No order-history page in the UI, no receipts, no admin sales view.
- Webtoon mode's "most visible page" tracking (for the slider/progress) is approximate (`IntersectionObserver`,
  50% threshold) — fine in practice, but not pixel-exact.
- Original uploads are deleted after conversion.
- No automated tests, no CI, project not in git.
- Lesson learned: if the backend seems to ignore `.env` changes, check for an old copy still holding port 4000.
  (The server now exits with a clear message if the port is taken; before it printed a false "listening".)

## 11. Suggested order from here

1. **Finish your test payment** (success, then also try a failed/cancelled one) and send me anything that looks wrong.
2. Optionally set up the webhook via a tunnel and try a refund from the Razorpay dashboard to see the book re-lock.
3. **Quick wins:** order-history page, then the starred Phase 4 items (git, tests, conversion queue, helmet) — change-password
   is already done.
4. **Phases 7–8** in whatever order matters to your users (admin edit/cover tools, book detail page).
5. **Phases 9–10** before showing it to the public: deployment, email, legal pages, Razorpay live-mode KYC.
