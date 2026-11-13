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
const coverUpload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

// A query string built from the cover file's own mtime, so a re-uploaded cover shows up immediately instead
// of readers keeping a browser-cached copy of the old one at the same URL.
function coverUrl(b) {
  if (b.status !== 'ready') return null;
  try {
    const v = fs.statSync(path.join(config.storageDir, 'books', String(b.id), 'cover.webp')).mtimeMs;
    return `/api/books/${b.id}/cover?v=${v}`;
  } catch {
    return `/api/books/${b.id}/cover`;
  }
}

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
  coverUrl: coverUrl(b),
  // Where this signed-in viewer last left off reading, and when; null for guests or never-opened books.
  lastPage: ctx.progress?.get(b.id)?.page ?? null,
  lastReadAt: ctx.progress?.get(b.id)?.updatedAt ?? null,
  favorited: ctx.favorites?.has(b.id) ?? false,
});

async function getBook(id) {
  const [rows] = await db().query('SELECT * FROM books WHERE id = ?', [id]);
  return rows[0];
}

// Shared by the initial upload and by retry: runs the conversion, then cleans up afterwards either way.
// On failure the original files are kept (via pending_conversions) instead of deleted, so retry has something
// to retry with; on success they're no longer needed by anyone.
function runConversion(bookId, files) {
  convertToBook(bookId, files)
    .then(async (pages) => {
      const values = pages.map((p) => [bookId, p.number, p.width, p.height]);
      await db().query('DELETE FROM pages WHERE book_id = ?', [bookId]); // in case this is a retry
      await db().query('INSERT INTO pages (book_id, number, width, height) VALUES ?', [values]);
      await db().query("UPDATE books SET status='ready', page_count=?, error=NULL WHERE id=?", [pages.length, bookId]);
      await db().query('DELETE FROM pending_conversions WHERE book_id = ?', [bookId]);
      await Promise.all(files.map((f) => fs.promises.rm(f.path, { force: true })));
    })
    .catch(async (err) => {
      console.error(`Conversion failed for book ${bookId}:`, err);
      await db().query("UPDATE books SET status='failed', error=? WHERE id=?", [String(err.message), bookId]);
      const kept = files.map((f) => ({ path: f.path, originalname: f.originalname }));
      await db().query(
        'INSERT INTO pending_conversions (book_id, files) VALUES (?, ?) ON DUPLICATE KEY UPDATE files = VALUES(files)',
        [bookId, JSON.stringify(kept)]
      );
    });
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

  // Catches the common "already added this" mistake. Titles aren't a unique DB constraint (two different
  // books can genuinely share a title), so this is a friendly check here, not a hard schema rule.
  const [dupes] = await db().query('SELECT id FROM books WHERE LOWER(title) = LOWER(?) LIMIT 1', [title]);
  if (dupes.length) {
    for (const f of files) fs.unlink(f.path, () => {});
    return res.status(409).json({ error: `A book titled "${title}" already exists in the library.`, field: 'title' });
  }

  const [result] = await db().query(
    'INSERT INTO books (title, author, description, price_cents, free_pages, owner_id) VALUES (?,?,?,?,?,?)',
    [title, req.body.author || null, req.body.description || null, priceCents, freePages, req.user.id]
  );
  const bookId = result.insertId;
  res.status(202).json(bookView(await getBook(bookId), await viewerContext(req.user)));

  // Background conversion (swap for a real job queue later)
  runConversion(bookId, files);
});

// Re-run conversion for a book that failed, using the originals kept around for exactly this purpose.
// Admin only; 409 if there's nothing kept to retry with (e.g. it was already deleted, or never failed).
router.post('/:id/retry', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  if (book.status !== 'failed') return res.status(400).json({ error: 'This book has not failed conversion' });

  const [rows] = await db().query('SELECT files FROM pending_conversions WHERE book_id = ?', [book.id]);
  if (!rows.length) return res.status(409).json({ error: 'The original files for this book are no longer available. Delete it and upload again.' });

  await db().query("UPDATE books SET status='processing', error=NULL WHERE id=?", [book.id]);
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
  // mysql2 auto-parses JSON columns, but tolerate either shape in case that ever changes.
  const kept = typeof rows[0].files === 'string' ? JSON.parse(rows[0].files) : rows[0].files;
  runConversion(book.id, kept);
});

router.get('/:id', async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const view = bookView(book, await viewerContext(req.user));
  if (book.status === 'ready') {
    // Page numbers wider than they are tall (a double-spread scanned as one image): the reader keeps these
    // standing alone in double-page mode instead of pairing them with a neighbor.
    const [rows] = await db().query('SELECT number FROM pages WHERE book_id = ? AND width > height', [book.id]);
    view.widePages = rows.map((r) => r.number);
  }
  res.json(view);
});

// Edit metadata after upload. Admin only; does not touch pages, cover, or status.
router.put('/:id', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });

  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required', field: 'title' });

  const priceCents = Math.max(0, parseInt(req.body.priceCents, 10) || 0);
  if (priceCents > 0 && priceCents < 100) {
    return res.status(400).json({ error: 'The minimum price for a paid book is 1.00', field: 'price' }); // Razorpay minimum
  }
  const freePages = Math.max(0, parseInt(req.body.freePages, 10) || 0);

  const [dupes] = await db().query('SELECT id FROM books WHERE LOWER(title) = LOWER(?) AND id <> ? LIMIT 1', [title, book.id]);
  if (dupes.length) {
    return res.status(409).json({ error: `A book titled "${title}" already exists in the library.`, field: 'title' });
  }

  await db().query('UPDATE books SET title=?, author=?, description=?, price_cents=?, free_pages=? WHERE id=?', [
    title,
    req.body.author || null,
    req.body.description || null,
    priceCents,
    freePages,
    book.id,
  ]);
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
});

// Set the cover to one of the book's own already-converted pages. Admin only; no upload needed, so it's instant.
router.put('/:id/cover/page/:n', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const n = parseInt(req.params.n, 10);
  if (book.status !== 'ready' || !(n >= 1 && n <= book.page_count)) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  const dir = path.join(config.storageDir, 'books', String(book.id));
  try {
    // The page file is already rotated/converted; just resize it down to cover size.
    await sharp(path.join(dir, `${n}.webp`)).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, 'cover.webp'));
  } catch {
    return res.status(400).json({ error: 'Could not use that page as the cover.' });
  }
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
});

router.get('/:id/cover', async (req, res) => {
  const file = path.join(config.storageDir, 'books', String(parseInt(req.params.id, 10)), 'cover.webp');
  res.sendFile(file, (err) => err && !res.headersSent && res.status(404).end());
});

// Replace the auto-picked (page 1) cover with a specific image. Admin only.
router.post('/:id/cover', requireAdmin, coverUpload.single('cover'), async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(book ? 400 : 404).json({ error: book ? 'No image uploaded' : 'Book not found' });
  }

  const dir = path.join(config.storageDir, 'books', String(book.id));
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Same processing the converter applies to the auto-picked cover, so a custom one matches in size/format.
    await sharp(req.file.path).rotate().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, 'cover.webp'));
  } catch {
    return res.status(400).json({ error: 'Could not process that image. Please upload a JPG, PNG or WebP file.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
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
  // `no-cache` still lets the browser keep a cached copy, but makes it always check back first (a 304 when
  // the file is genuinely unchanged) — admin page edits (replace/reorder/delete) change what's at this same
  // URL, and a blind max-age would keep showing the old image for up to an hour.
  res.set('Cache-Control', 'private, no-cache');
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
  res.set('Cache-Control', 'private, no-cache'); // see the comment on the full-page route above
  res.sendFile(thumb);
});

// Replace a single page's image, keeping its position. Admin only.
router.put('/:id/pages/:n/replace', requireAdmin, upload.single('file'), async (req, res) => {
  const book = await getBook(req.params.id);
  const n = parseInt(req.params.n, 10);
  if (!book || book.status !== 'ready' || !(n >= 1 && n <= book.page_count)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(book ? 400 : 404).json({ error: book ? 'Invalid page number' : 'Book not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const dir = path.join(config.storageDir, 'books', String(book.id));
  let info;
  try {
    info = await sharp(req.file.path).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, `${n}.webp`));
  } catch {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Could not process that image. Please upload a JPG, PNG or WebP file.' });
  }
  fs.unlink(req.file.path, () => {});
  fs.unlink(path.join(dir, 'thumbs', `${n}.webp`), () => {}); // stale; regenerated lazily on next request
  await db().query('UPDATE pages SET width = ?, height = ? WHERE book_id = ? AND number = ?', [info.width, info.height, book.id, n]);
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
});

// Reorder every page in one go. Admin only. `order` is a permutation of 1..pageCount: the OLD page numbers,
// listed in their new order (e.g. [3,1,2] means the old page 3 is now page 1, old page 1 is now page 2, ...).
router.put('/:id/pages/reorder', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const order = Array.isArray(req.body.order) ? req.body.order.map((n) => parseInt(n, 10)) : [];
  const valid = order.length === book.page_count && new Set(order).size === book.page_count && order.every((n) => n >= 1 && n <= book.page_count);
  if (!valid) return res.status(400).json({ error: 'Order must list every page exactly once' });

  const dir = path.join(config.storageDir, 'books', String(book.id));

  // Verify every source file is actually there before touching anything — a missing file must never turn
  // into a half-renamed book.
  for (const oldNum of order) {
    if (!fs.existsSync(path.join(dir, `${oldNum}.webp`))) {
      return res.status(500).json({ error: `Page ${oldNum} is missing from storage. Refresh and try again.` });
    }
  }

  // Every rename actually performed, in order, so a failure partway through can be undone exactly.
  const done = [];
  const renameTracked = (from, to) => {
    fs.renameSync(from, to);
    done.push({ from, to });
  };
  const rollback = () => {
    for (const { from, to } of done.reverse()) {
      try {
        fs.renameSync(to, from);
      } catch {
        // best effort; we already logged the original error below
      }
    }
  };

  try {
    // Two passes (old -> temp, temp -> new) so an arbitrary permutation never has one rename overwrite another.
    for (const oldNum of order) {
      renameTracked(path.join(dir, `${oldNum}.webp`), path.join(dir, `tmp-${oldNum}.webp`));
      const thumb = path.join(dir, 'thumbs', `${oldNum}.webp`);
      if (fs.existsSync(thumb)) renameTracked(thumb, path.join(dir, 'thumbs', `tmp-${oldNum}.webp`));
    }
    for (let i = 0; i < order.length; i++) {
      const oldNum = order[i];
      const newNum = i + 1;
      renameTracked(path.join(dir, `tmp-${oldNum}.webp`), path.join(dir, `${newNum}.webp`));
      const tmpThumb = path.join(dir, 'thumbs', `tmp-${oldNum}.webp`);
      if (fs.existsSync(tmpThumb)) renameTracked(tmpThumb, path.join(dir, 'thumbs', `${newNum}.webp`));
    }
  } catch (err) {
    console.error(`Reorder failed for book ${book.id}, rolling back:`, err);
    rollback();
    return res.status(500).json({ error: 'Could not reorder pages; nothing was changed. Please try again.' });
  }

  // Files are safely in their final place before the DB is touched at all, so this can't desync the two.
  await db().query('UPDATE pages SET number = -number WHERE book_id = ?', [book.id]);
  for (let i = 0; i < order.length; i++) {
    await db().query('UPDATE pages SET number = ? WHERE book_id = ? AND number = ?', [i + 1, book.id, -order[i]]);
  }
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
});

// Delete one page, renumbering everything after it so page numbers stay contiguous. Admin only.
router.delete('/:id/pages/:n', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const n = parseInt(req.params.n, 10);
  if (book.status !== 'ready' || !(n >= 1 && n <= book.page_count)) {
    return res.status(400).json({ error: 'Invalid page number' });
  }
  if (book.page_count <= 1) return res.status(400).json({ error: 'A book must have at least one page' });

  const dir = path.join(config.storageDir, 'books', String(book.id));

  // Same reasoning as reorder: confirm every file we're about to shift is actually there before deleting anything.
  for (let k = n + 1; k <= book.page_count; k++) {
    if (!fs.existsSync(path.join(dir, `${k}.webp`))) {
      return res.status(500).json({ error: `Page ${k} is missing from storage. Refresh and try again.` });
    }
  }

  fs.unlink(path.join(dir, `${n}.webp`), () => {});
  fs.unlink(path.join(dir, 'thumbs', `${n}.webp`), () => {});
  await db().query('DELETE FROM pages WHERE book_id = ? AND number = ?', [book.id, n]);

  for (let k = n + 1; k <= book.page_count; k++) {
    fs.renameSync(path.join(dir, `${k}.webp`), path.join(dir, `${k - 1}.webp`));
    const thumb = path.join(dir, 'thumbs', `${k}.webp`);
    if (fs.existsSync(thumb)) fs.renameSync(thumb, path.join(dir, 'thumbs', `${k - 1}.webp`));
    await db().query('UPDATE pages SET number = ? WHERE book_id = ? AND number = ?', [k - 1, book.id, k]);
  }

  const newCount = book.page_count - 1;
  const newFreePages = Math.min(book.free_pages, newCount);
  await db().query('UPDATE books SET page_count = ?, free_pages = ? WHERE id = ?', [newCount, newFreePages, book.id]);
  await db().query('UPDATE reading_progress SET page = ? WHERE book_id = ? AND page > ?', [newCount, book.id, newCount]);
  res.json(bookView(await getBook(book.id), await viewerContext(req.user)));
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

router.put('/:id/favorite', requireAuth, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  await db().query('INSERT IGNORE INTO favorites (user_id, book_id) VALUES (?, ?)', [req.user.id, book.id]);
  res.status(204).end();
});

router.delete('/:id/favorite', requireAuth, async (req, res) => {
  await db().query('DELETE FROM favorites WHERE user_id = ? AND book_id = ?', [req.user.id, req.params.id]);
  res.status(204).end();
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const book = await getBook(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const [pending] = await db().query('SELECT files FROM pending_conversions WHERE book_id = ?', [book.id]);
  await db().query('DELETE FROM books WHERE id = ?', [book.id]); // cascades pending_conversions, progress, favorites
  fs.rmSync(path.join(config.storageDir, 'books', String(book.id)), { recursive: true, force: true });
  if (pending.length) {
    const kept = typeof pending[0].files === 'string' ? JSON.parse(pending[0].files) : pending[0].files;
    for (const f of kept) fs.unlink(f.path, () => {});
  }
  res.status(204).end();
});

module.exports = router;
