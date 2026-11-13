const jwt = require('jsonwebtoken');
const config = require('./config');
const { db } = require('./db');

const cookieOptions = () => ({
  httpOnly: true, // not readable from page scripts, which limits the damage of an XSS bug
  sameSite: 'lax', // not sent on cross-site POSTs, which covers the CSRF case
  secure: config.isProd, // https only in production
  maxAge: config.cookieMaxAgeMs,
  path: '/',
});

function startSession(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.cookie(config.cookieName, token, cookieOptions());
}

function endSession(res) {
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
}

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email });

// Sets req.user when a valid session cookie is present. Never rejects: routes decide whether login is required.
async function attachUser(req, _res, next) {
  req.user = null;
  const token = req.cookies?.[config.cookieName];
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const [rows] = await db().query('SELECT id, username, email FROM users WHERE id = ?', [sub]);
    req.user = rows[0] || null;
  } catch {
    // expired or tampered token: treat as logged out
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue' });
  next();
}

module.exports = { startSession, endSession, publicUser, attachUser, requireAuth };
