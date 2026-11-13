const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { startSession, endSession, publicUser, requireAuth } = require('../auth');

const router = express.Router();

// Brute-force protection for credential endpoints (per IP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const BCRYPT_ROUNDS = 12;
// Used to keep login timing similar whether or not the username exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const bad = (res, error, field) => res.status(400).json({ error, field });

// Usernames and emails are unique case-insensitively (the column collation is case-insensitive),
// so "Alice" and "alice" can't both exist. The original capitalisation of the username is kept for display.
router.post('/signup', authLimiter, async (req, res) => {
  const username = clean(req.body.username);
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!USERNAME_RE.test(username)) {
    return bad(res, 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore', 'username');
  }
  if (!EMAIL_RE.test(email) || email.length > 255) return bad(res, 'Please enter a valid email address', 'email');
  if (password.length < 8) return bad(res, 'Password must be at least 8 characters', 'password');
  if (password.length > 72) return bad(res, 'Password must be at most 72 characters', 'password'); // bcrypt limit
  if (password !== confirmPassword) return bad(res, 'Passwords do not match', 'confirmPassword');

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const [result] = await db().query('INSERT INTO users (username, email, password_hash) VALUES (?,?,?)', [username, email, hash]);
    startSession(res, result.insertId);
    res.status(201).json(publicUser({ id: result.insertId, username, email }));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      // The unique-index name in the MySQL message tells us which field collided.
      const field = /uq_users_email/.test(err.sqlMessage || '') ? 'email' : 'username';
      const error = field === 'email' ? 'An account with this email already exists' : 'This username is already taken';
      return res.status(409).json({ error, field });
    }
    throw err;
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const username = clean(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const [rows] = await db().query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect username or password' });

  startSession(res, user.id);
  res.json(publicUser(user));
});

router.post('/logout', (_req, res) => {
  endSession(res);
  res.status(204).end();
});

// Returns the signed-in user, or null (200) when logged out so the client can check without an error.
router.get('/me', (req, res) => {
  res.json(req.user ? publicUser(req.user) : null);
});

router.put('/email', authLimiter, requireAuth, async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 255) return bad(res, 'Please enter a valid email address', 'email');

  try {
    await db().query('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
    res.json(publicUser({ ...req.user, email }));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists', field: 'email' });
    throw err;
  }
});

router.put('/password', authLimiter, requireAuth, async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmNewPassword = typeof req.body.confirmNewPassword === 'string' ? req.body.confirmNewPassword : '';

  const [rows] = await db().query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    return bad(res, 'Current password is incorrect', 'currentPassword');
  }
  if (newPassword.length < 8) return bad(res, 'Password must be at least 8 characters', 'newPassword');
  if (newPassword.length > 72) return bad(res, 'Password must be at most 72 characters', 'newPassword');
  if (newPassword !== confirmNewPassword) return bad(res, 'Passwords do not match', 'confirmNewPassword');

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db().query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.status(204).end();
});

// Self-service delete is refused for accounts with any purchase history, since those rows are financial
// records we keep (see the `purchases` table); such accounts need a human to handle closing them.
router.delete('/me', authLimiter, requireAuth, async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const [rows] = await db().query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(password, rows[0].password_hash))) {
    return bad(res, 'Incorrect password', 'password');
  }

  const [[{ count }]] = await db().query('SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?', [req.user.id]);
  if (count > 0) {
    return res.status(409).json({ error: "Accounts with purchase history can't be deleted automatically. Please contact support." });
  }

  await db().query('DELETE FROM users WHERE id = ?', [req.user.id]);
  endSession(res);
  res.status(204).end();
});

module.exports = router;
