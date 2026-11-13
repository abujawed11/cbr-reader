// Central place for the paywall rule. Replace hasPurchased() once auth + payments exist.
async function hasPurchased(/* userId, bookId */) {
  return false;
}

async function canReadPage(book, pageNumber, userId) {
  if (book.price_cents === 0) return true;
  if (pageNumber <= book.free_pages) return true;
  return hasPurchased(userId, book.id);
}

module.exports = { canReadPage };
