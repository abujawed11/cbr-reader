const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('../db');
const { convertToBook } = require('../converter');
const { canReadPage } = require('../access');

const router = express.Router();
const uploadDir = path.join(config.storageDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 1024 * 1024 * 1024 } });

const bookView = (b) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  description: b.description,
  priceCents: b.price_cents,
  freePages: b.free_pages,
  pageCount: b.page_count,
  // How many pages the current viewer may read (will depend on purchases once auth exists).
  readablePages: b.price_cents === 0 ? b.page_count : Math.min(b.free_pages, b.page_count),
  status: b.status,
  error: b.error,
  coverUrl: b.status === 'ready' ? `/api/books/${b.id}/cover` : null,
});

async function getBook(id) {
  const [rows] = await db().query('SELECT * FROM books WHERE id = ?', [id]);
  return rows[0];
}

// List library
router.get('/', async (_req, res) => {
  const [rows] = await db().query('SELECT * FROM books ORDER BY created_at DESC');
  res.json(rows.map(bookView));
});

// Upload one archive (.cbr/.cbz) or several images -> new book (converted in background)
router.post('/', upload.array('files', 2000), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

  const title = (req.body.title || '').trim() || path.parse(files[0].originalname).name;
  const priceCents = Math.max(0, parseInt(req.body.priceCents, 10) || 0);
  const freePages = Math.max(0, parseInt(req.body.freePages, 10) || config.defaultFreePages);

  const [result] = await db().query(
    'INSERT INTO books (title, author, description, price_cents, free_pages) VALUES (?,?,?,?,?)',
    [title, req.body.author || null, req.body.description || null, priceCents, freePages]
  );
  const bookId = result.insertId;
  res.status(202).json(bookView(await getBook(bookId)));

  // Background conversion (swap for a real job queue later)
  convertToBook(bookId, files)
    .then(async (pages) => {
      const values = pages.map((p) => [bookId, p.number, p.width, p.height]);
      await db().query('INSERT INTO pages (book_id, number, width, height) VALUES ?', [values]);
      await db().query("UPDATE books SET status='ready', page_count=? WHERE id=?", [pages.length, bookId]);
    })
    .catch(async (err) => {
      console.error(`Conversion failed for book ${bookId}:`, err);
      await db().query("UPDATE books SET status='failed', error=? WHERE id=?", [String(err.message), bookId]);
    });
});

router.get('/:id', async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(bookView(book));
});

router.get('/:id/cover', async (req, res) => {
  const file = path.join(config.storageDir, 'books', String(parseInt(req.params.id, 10)), 'cover.webp');
  res.sendFile(file, (err) => err && !res.headersSent && res.status(404).end());
});

// Paywalled page access: only pages the user is allowed to read are ever served.
router.get('/:id/pages/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  const book = await getBook(req.params.id);
  if (!book || book.status !== 'ready' || !(n >= 1 && n <= book.page_count)) {
    return res.status(404).json({ error: 'Page not found' });
  }
  if (!(await canReadPage(book, n, null))) {
    return res.status(403).json({ error: 'Purchase required to read this page' });
  }
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(config.storageDir, 'books', String(book.id), `${n}.webp`));
});

router.delete('/:id', async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  await db().query('DELETE FROM books WHERE id = ?', [book.id]);
  fs.rmSync(path.join(config.storageDir, 'books', String(book.id)), { recursive: true, force: true });
  res.status(204).end();
});

module.exports = router;
