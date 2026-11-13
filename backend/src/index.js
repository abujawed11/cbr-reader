const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { initDb } = require('./db');
const { attachUser } = require('./auth');
const authRouter = require('./routes/auth');
const booksRouter = require('./routes/books');

async function main() {
  await initDb();
  const app = express();
  app.use(morgan('dev')); // concise colored request log: METHOD /url status time
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/books', booksRouter);

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Server error' });
  });

  app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
