// Central place for the paywall rule: who may read which pages.
//
//   - free books (price 0): everyone
//   - paid books: the first `free_pages` pages for everyone, the rest for admins and buyers
const { db } = require('./db');

// Everything we need to know about the person asking, loaded once per request.
async function viewerContext(user) {
  if (!user) return { admin: false, owned: new Set() };
  const [rows] = await db().query(
    "SELECT book_id FROM purchases WHERE user_id = ? AND status = 'paid' AND book_id IS NOT NULL",
    [user.id]
  );
  return { admin: user.role === 'admin', owned: new Set(rows.map((r) => r.book_id)) };
}

const hasFullAccess = (book, ctx) => book.price_cents === 0 || ctx.admin || ctx.owned.has(book.id);

async function canReadPage(book, pageNumber, user) {
  if (book.price_cents === 0 || pageNumber <= book.free_pages) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [rows] = await db().query(
    "SELECT 1 FROM purchases WHERE user_id = ? AND book_id = ? AND status = 'paid' LIMIT 1",
    [user.id, book.id]
  );
  return rows.length > 0;
}

module.exports = { viewerContext, hasFullAccess, canReadPage };
