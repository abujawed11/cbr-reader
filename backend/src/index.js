const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDb } = require('./db');
const booksRouter = require('./routes/books');

async function main() {
  await initDb();
  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/books', booksRouter);

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
