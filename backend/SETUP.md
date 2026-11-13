# Backend Setup (new PC)

Follow these steps after pulling the code on a new machine. Commands are for Windows (PowerShell or Git Bash);
macOS/Linux differences are noted where they matter.

---

## 1. Install the prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20 or newer (22 recommended) | `node -v` |
| npm | comes with Node | `npm -v` |
| MySQL Server | 8.x | `mysql --version` |
| MySQL Workbench | optional, handy for running SQL | |
| Git | any | `git --version` |

No other system tools are needed. PDF rendering and image processing use packages that ship their own binaries
(`pdfjs-dist`, `@napi-rs/canvas`, `sharp`), so you do **not** need poppler, ImageMagick, or UnRAR installed.

If `mysql` isn't recognised in the terminal, either use MySQL Workbench for the SQL steps, or call it by full path:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --version
```

---

## 2. Install dependencies

```bash
cd backend
npm install
```

---

## 3. Create the database and a database user

Do this once per machine. You can use **MySQL Workbench** (open a connection as `root`, open a new query tab, paste, run)
or the command line:

```powershell
mysql -u root -p
```

Then run:

```sql
-- 1. The database
CREATE DATABASE IF NOT EXISTS cbr_reader
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 2. A dedicated user (don't run the app as root)
CREATE USER IF NOT EXISTS 'cbr_user'@'localhost' IDENTIFIED BY 'ChangeThisPassword123!';

-- 3. Give it access to that database only
GRANT ALL PRIVILEGES ON cbr_reader.* TO 'cbr_user'@'localhost';
FLUSH PRIVILEGES;

-- 4. Check it worked
SHOW DATABASES LIKE 'cbr_reader';
SHOW GRANTS FOR 'cbr_user'@'localhost';
```

Notes:
- Replace `ChangeThisPassword123!` with your own password and remember it for the `.env` file.
- If MySQL rejects the password, its strength policy wants something longer: upper and lower case, a digit and a symbol.
- **You do not create any tables.** The backend creates and migrates `users`, `books`, `pages` and `purchases`
  by itself on startup.
- Quick shortcut for local development only: if you put the `root` credentials in `.env`, the app will also create the
  database itself. A limited user like `cbr_user` can't do that, which is why step 3 creates it first.

### Test the login from the terminal (optional)

```powershell
mysql -u cbr_user -p cbr_reader
```
Type `SHOW TABLES;` after the first backend start to see the tables appear.

---

## 4. Create the `.env` file

`.env` holds secrets and is **not** in git, so you must create it on every machine.

```powershell
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

Generate a random value for `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then edit `backend/.env`:

```ini
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

# Database (the user and database from step 3)
DB_HOST=localhost
DB_PORT=3306
DB_USER=cbr_user
DB_PASSWORD=ChangeThisPassword123!
DB_NAME=cbr_reader

# Session signing key: paste the random string from the command above (32+ characters)
JWT_SECRET=paste-the-generated-value-here

# Payments (Razorpay), see step 7. Safe to leave blank until you test payments.
CURRENCY=INR
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

| Variable | Required | What it is |
|---|---|---|
| `PORT` | no (4000) | Port the API listens on. The frontend dev server proxies `/api` to this port. |
| `CLIENT_ORIGIN` | no | Frontend URL allowed to call the API (CORS). |
| `DB_HOST`, `DB_PORT` | no | Where MySQL runs (defaults: `localhost`, `3306`). |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | The database credentials from step 3. |
| `JWT_SECRET` | **yes** | Signs login cookies. The server **refuses to start** if it is missing, shorter than 32 characters, or still the placeholder. |
| `CURRENCY` | no (INR) | Currency for paid books. Prices are stored in the smallest unit (paise). |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for payments | Razorpay API keys. Without them the app works, but Buy shows "Payments are not set up yet". |
| `RAZORPAY_WEBHOOK_SECRET` | optional | Only needed for Razorpay's server-to-server notifications (step 7). |

Never commit `.env`, and never reuse the same `JWT_SECRET` or passwords between your dev machine and production.

---

## 5. Start the backend

```bash
npm run dev      # restarts automatically when you edit files
# or
npm start        # plain run, no auto-restart
```

You should see:

```
API listening on http://localhost:4000
```

Check it in a browser or terminal: <http://localhost:4000/api/health> should return `{"ok":true}`.

On first start the backend also creates the `backend/storage/` folder (uploaded and converted book pages live there).
It is not in git, so a fresh PC starts with an empty library.

---

## 6. Create the admin account

Only admins can upload and delete books. With the backend's `.env` ready, run from the `backend` folder:

```bash
node create-admin.js
```

This creates (or promotes) the account:

| Username | Email | Password |
|---|---|---|
| `admin` | `admin@example.com` | `admin123` |

- It is safe to run again: it just says the admin already exists.
- The script refuses to run when `NODE_ENV=production`.
- **These credentials are for local development only.** Change them (or delete the account) before the app is reachable by anyone else.

---

## 7. Razorpay payments (optional until you test purchases)

1. Log in to the Razorpay Dashboard and switch to **Test Mode**.
2. Go to **Account & Settings → API Keys → Generate Test Key**.
3. Put `RAZORPAY_KEY_ID` (starts with `rzp_test_`) and `RAZORPAY_KEY_SECRET` in `.env`, then **restart the backend**
   (`.env` is only read at startup).

Test payments (as a normal user, not the admin; admins can't buy):
- Test card: `4111 1111 1111 1111`, any future expiry, any CVV.
- Test UPI: `success@razorpay` (use `failure@razorpay` to test a failed payment).

**Webhook (optional safety net):** it unlocks a book if someone pays but closes the browser before returning to the app.
Razorpay can't reach `localhost`, so you need a public tunnel while developing:

```bash
cloudflared tunnel --url http://localhost:4000
```

Then in the Razorpay Dashboard → **Webhooks → Add new webhook**:
- URL: `https://<your-tunnel-address>/api/payments/webhook`
- Events: `payment.captured`, `order.paid`, `refund.processed`
- Set a secret and copy the same value into `RAZORPAY_WEBHOOK_SECRET`, then restart the backend.

A free tunnel address changes each time you restart it, so update the webhook URL when it does.

---

## 8. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173> and sign in as `admin` / `admin123`. The frontend forwards `/api` requests to
`http://localhost:4000`, so the backend must be running.

---

## 9. Moving your existing data to the new PC (optional)

A fresh setup starts empty. To bring your books and accounts across, copy **both** the database and the images.

**On the old PC** (run in a terminal, adjust the path to `mysqldump` if needed):

```powershell
mysqldump -u cbr_user -p cbr_reader > cbr_reader_backup.sql
```
and copy the folder `backend/storage/` (it holds the page images, covers and thumbnails).

**On the new PC**, after steps 1–4 (database and user created, `.env` filled in, but before first use):

```powershell
mysql -u cbr_user -p cbr_reader < cbr_reader_backup.sql
```
then put the `storage` folder back at `backend/storage/`. Books and the database must come across together: the database
only stores which pages exist, and the images live in `storage/`.

Note: the `JWT_SECRET` can be different on the new PC. Everyone will just have to log in again.

---

## 10. Handy commands

| What | Command |
|---|---|
| Start with auto-restart | `npm run dev` |
| Start normally | `npm start` |
| Seed / promote the admin | `node create-admin.js` |
| Syntax-check a file | `node --check src/index.js` |
| Back up the database | `mysqldump -u cbr_user -p cbr_reader > backup.sql` |
| Restore a backup | `mysql -u cbr_user -p cbr_reader < backup.sql` |

**Start completely fresh (deletes all data!):**

```sql
DROP DATABASE cbr_reader;
CREATE DATABASE cbr_reader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON cbr_reader.* TO 'cbr_user'@'localhost';
```
then delete the `backend/storage/` folder, restart the backend, and run `node create-admin.js` again.

**Reset a forgotten database user password:**

```sql
ALTER USER 'cbr_user'@'localhost' IDENTIFIED BY 'NewPassword123!';
```
and update `DB_PASSWORD` in `.env`.

---

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `JWT_SECRET is missing or too weak` on start | Set a random 32+ character `JWT_SECRET` in `.env` (step 4). |
| `Access denied for user 'cbr_user'@'localhost'` | Wrong `DB_USER`/`DB_PASSWORD` in `.env`, or the user wasn't created (step 3). |
| `Unknown database 'cbr_reader'` | Create the database (step 3) or use a user that is allowed to create it. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running. Start the MySQL service (Windows: open `services.msc` and start the one named like **MySQL80**, or run `net start MySQL80` in an admin terminal). |
| `Port 4000 is already in use` | An old copy of the backend is still running. Find it: `netstat -ano \| findstr :4000`, then stop it: `taskkill /PID <pid> /F`. |
| Changes to `.env` seem ignored | `.env` is read only at startup, and an old backend may still own port 4000. Stop all copies, then start one. |
| Buy shows "Payments are not set up yet" | `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank, or the backend wasn't restarted after adding them. |
| Frontend shows "Could not reach the server" | The backend isn't running, or isn't on port 4000 (the Vite proxy expects 4000). |
| Upload says "Admin access required" | You're not signed in as an admin. Run `node create-admin.js` and sign in as `admin`. |
| Book stuck on "Converting pages…" | The server was restarted mid-conversion, or the file is corrupt. Delete the book and upload again. |
| `npm install` fails on `sharp` or `@napi-rs/canvas` | These download a prebuilt binary during install. Use Node 20+, check your internet/proxy, then delete the `node_modules` folder and run `npm install` again. |
