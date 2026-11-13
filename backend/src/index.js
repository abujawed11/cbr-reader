const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { initDb } = require('./db');
const { attachUser } = require('./auth');
const authRouter = require('./routes/auth');
const booksRouter = require('./routes/books');
const paymentsRouter = require('./routes/payments');

async function main() {
  await initDb();
  const app = express();
  app.use(morgan('dev')); // concise colored request log: METHOD /url status time
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  // The webhook signature covers the exact bytes Razorpay sent, so this path must get the raw body
  // BEFORE express.json() would parse (and alter) it.
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/payments', paymentsRouter);

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    console.error(err);
    // Only show messages for client errors, or server errors we deliberately marked safe (err.expose).
    const showMessage = err.status && (err.status < 500 || err.expose);
    res.status(err.status || 500).json({ error: showMessage ? err.message : 'Server error' });
  });

  // Express 5 passes startup errors (e.g. EADDRINUSE) to this callback instead of throwing.
  app.listen(config.port, (err) => {
    if (err) {
      console.error(
        err.code === 'EADDRINUSE'
          ? `Port ${config.port} is already in use. Another copy of the backend is probably still running.`
          : `Could not start the server: ${err.message}`
      );
      process.exit(1);
    }
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
