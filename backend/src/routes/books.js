const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { db } = require('../db');
const { convertToBook } = require('../converter');
const { canReadPage, viewerContext, hasFullAccess } = require('../access');
const { requireAdmin, requireAuth } = require('../auth');

const router = express.Router();
const uploadDir = path.join(config.storageDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 1024 * 1024 * 1024 } });

// ctx comes from viewerContext(): it says whether this viewer is an admin or owns the book.
const bookView = (b, ctx) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  description: b.description,
  priceCents: b.price_cents, // smallest currency unit (paise for INR); the name is historical
  currency: config.currency,
  freePages: b.free_pages,
  pageCount: b.page_count,
  purchased: ctx.owned.has(b.id),
  // How many pages THIS viewer may read: everything if free, bought, or admin; otherwise the preview.
  readablePages: hasFullAccess(b, ctx) ? b.page_count : Math.min(b.free_pages, b.page_count),
  status: b.status,
  error: b.error,
  coverUrl: b.status === 'ready' ? `/api/books/${b.id}/cover` : null,
  // Where this signed-in viewer last left off reading, and when; null for guests or never-opened books.
  lastPage: ctx.progress?.get(b.id)?.page ?? null,
  lastReadAt: ctx.progress?.get(b.id)?.updatedAt ?? null,
});

async function getBook(id) {
  const [rows] = await db().query('SELECT * FROM books WHERE id = ?', [id]);
  return rows[0];
}

// List library
router.get('/', async (req, res) => {
  const [rows] = await db().query('SELECT * FROM books ORDER BY created_at DESC');
  const ctx = await viewerContext(req.user);
  res.json(rows.map((b) => bookView(b, ctx)));
});

// Upload one archive (.cbr/.cbz) or several images -> new book (converted in background)
// Admin only. requireAdmin runs before multer so other clients can't make us write files to disk.
router.post('/', requireAdmin, upload.array('files', 2000), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

  const title = (req.body.title || '').trim() || path.parse(files[0].originalname).name;
  const priceCents = Math.max(0, parseInt(req.body.priceCents, 10) || 0);
  if (priceCents > 0 && priceCents < 100) {
    return res.status(400).json({ error: 'The minimum price for a paid book is 1.00' }); // Razorpay minimum
  }
  const freePages = Math.max(0, parseInt(req.body.freePages, 10) || config.defaultFreePages);

  const [result] = await db().query(
    'INSERT INTO books (title, author, description, price_cents, free_pages, owner_id) VALUES (?,?,?,?,?,?)',
    [title, req.body.author || null, req.body.description || null, priceCents, freePages, req.user.id]
  );
  const bookId = result.insertId;
  res.status(202).json(bookView(await getBook(bookId), await viewerContext(req.user)));

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
  res.json(bookView(book, await viewerContext(req.user)));
});

router.get('/:id/cover', async (req, res) => {
  const file = path.join(config.storageDir, 'books', String(parseInt(req.params.id, 10)), 'cover.webp');
  res.sendFile(file, (err) => err && !res.headersSent && res.status(404).end());
});

// Shared paywall gate for page + thumbnail routes. Sends the error response and returns null if denied.
async function authorizePage(req, res) {
  const n = parseInt(req.params.n, 10);
  const book = await getBook(req.params.id);
  if (!book || book.status !== 'ready' || !(n >= 1 && n <= book.page_count)) {
    res.status(404).json({ error: 'Page not found' });
    return null;
  }
  if (!(await canReadPage(book, n, req.user))) {
    res.status(403).json({ error: 'Purchase required to read this page' });
    return null;
  }
  return { book, n };
}

// Paywalled page access: only pages the user is allowed to read are ever served.
router.get('/:id/pages/:n', async (req, res) => {
  const ok = await authorizePage(req, res);
  if (!ok) return;
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.join(config.storageDir, 'books', String(ok.book.id), `${ok.n}.webp`));
});

// Small thumbnail, generated on first request and cached on disk. Same paywall rule as full pages.
router.get('/:id/pages/:n/thumb', async (req, res) => {
  const ok = await authorizePage(req, res);
  if (!ok) return;
  const dir = path.join(config.storageDir, 'books', String(ok.book.id));
  const thumb = path.join(dir, 'thumbs', `${ok.n}.webp`);
  if (!fs.existsSync(thumb)) {
    fs.mkdirSync(path.dirname(thumb), { recursive: true });
    await sharp(path.join(dir, `${ok.n}.webp`)).resize({ width: 240 }).webp({ quality: 70 }).toFile(thumb);
  }
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(thumb);
});

// Reading progress: one upsert per (user, book). Clamped server-side; the client just reports where it is.
router.put('/:id/progress', requireAuth, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const page = Math.min(Math.max(parseInt(req.body.page, 10) || 1, 1), Math.max(book.page_count, 1));
  await db().query(
    `INSERT INTO reading_progress (user_id, book_id, page) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE page = VALUES(page)`,
    [req.user.id, book.id, page]
  );
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  await db().query('DELETE FROM books WHERE id = ?', [book.id]);
  fs.rmSync(path.join(config.storageDir, 'books', String(book.id)), { recursive: true, force: true });
  res.status(204).end();
});

module.exports = router;
