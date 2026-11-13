require('dotenv').config();
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith('replace-with')) {
  throw new Error('JWT_SECRET is missing or too weak. Set a random string of 32+ characters in backend/.env');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbr_reader',
  },
  jwtSecret,
  jwtExpiresIn: '7d',
  cookieName: 'session',
  cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  storageDir: path.join(__dirname, '..', 'storage'),
  defaultFreePages: 10,
};
