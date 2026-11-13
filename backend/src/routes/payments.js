const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { getClient, verifyCheckoutSignature, verifyWebhookSignature } = require('../razorpay');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please try again in a few minutes.' },
});

const MIN_AMOUNT = 100; // Razorpay's minimum order is 1.00 in the currency's main unit

// ---------- purchase state changes (shared by the browser callback and the webhook) ----------

// Idempotent: running it twice for the same order is harmless. Returns true if this call changed the row.
async function markPaid(orderId, paymentId) {
  const [result] = await db().query(
    "UPDATE purchases SET status='paid', razorpay_payment_id=?, paid_at=NOW() WHERE razorpay_order_id=? AND status IN ('created','failed')",
    [paymentId, orderId]
  );
  return result.affectedRows > 0;
}

const getPurchaseByOrder = async (orderId) => {
  const [rows] = await db().query('SELECT * FROM purchases WHERE razorpay_order_id = ?', [orderId]);
  return rows[0];
};

// Confirm with Razorpay that the payment is real and matches what we asked for, then unlock the book.
// Never trusts amounts or ids that came from the browser.
async function confirmAndFulfil(purchase, paymentId) {
  const client = getClient();
  let payment = await client.payments.fetch(paymentId);

  if (
    payment.order_id !== purchase.razorpay_order_id ||
    Number(payment.amount) !== purchase.amount ||
    payment.currency !== purchase.currency
  ) {
    const err = new Error('Payment details do not match this order');
    err.status = 400;
    throw err;
  }

  // If the Razorpay account uses manual capture, money is only reserved until we capture it.
  if (payment.status === 'authorized') {
    payment = await client.payments.capture(paymentId, purchase.amount, purchase.currency);
  }
  if (payment.status !== 'captured') {
    const err = new Error('Payment was not completed');
    err.status = 402;
    throw err;
  }

  await markPaid(purchase.razorpay_order_id, paymentId);
}

// ---------- routes used by the app ----------

// Step 1: the reader clicks Buy. We price the order from OUR database, never from the request.
router.post('/orders', limiter, requireAuth, async (req, res) => {
  const bookId = parseInt(req.body.bookId, 10);
  const [books] = await db().query('SELECT * FROM books WHERE id = ?', [bookId]);
  const book = books[0];

  if (!book || book.status !== 'ready') return res.status(404).json({ error: 'Book not found' });
  if (book.price_cents === 0) return res.status(400).json({ error: 'This book is free' });
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admins already have access to every book' });

  const [owned] = await db().query(
    "SELECT 1 FROM purchases WHERE user_id = ? AND book_id = ? AND status = 'paid' LIMIT 1",
    [req.user.id, book.id]
  );
  if (owned.length) return res.status(409).json({ error: 'You already own this book' });

  let order;
  try {
    order = await getClient().orders.create({
      amount: book.price_cents,
      currency: config.currency,
      receipt: `b${book.id}u${req.user.id}t${Date.now().toString(36)}`.slice(0, 40), // Razorpay limit: 40 chars
      notes: { user_id: String(req.user.id), book_id: String(book.id) },
    });
  } catch (err) {
    if (err.status) throw err; // our own "not configured" error
    console.error('Razorpay order creation failed:', err?.error || err);
    return res.status(502).json({ error: 'Could not start the payment. Please try again.' });
  }

  await db().query(
    'INSERT INTO purchases (user_id, book_id, book_title, amount, currency, razorpay_order_id) VALUES (?,?,?,?,?,?)',
    [req.user.id, book.id, book.title, book.price_cents, config.currency, order.id]
  );

  res.status(201).json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: config.razorpay.keyId, // the public key id is meant to be sent to the browser
    user: { name: req.user.username, email: req.user.email },
  });
});

// Step 2: the Checkout popup succeeded and gave the browser a signed receipt. This unlocks the book at once;
// the webhook below is the safety net for when the browser never gets to call this (tab closed, network drop).
router.post('/verify', limiter, requireAuth, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (![orderId, paymentId, signature].every((v) => typeof v === 'string' && v)) {
    return res.status(400).json({ error: 'Missing payment details' });
  }
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  const purchase = await getPurchaseByOrder(orderId);
  if (!purchase) return res.status(404).json({ error: 'Order not found' });
  if (purchase.user_id !== req.user.id) return res.status(403).json({ error: 'This order belongs to another account' });
  if (purchase.status === 'paid') return res.json({ ok: true, bookId: purchase.book_id });
  if (purchase.status === 'refunded') return res.status(409).json({ error: 'This payment was refunded' });

  try {
    await confirmAndFulfil(purchase, paymentId);
  } catch (err) {
    if (err.status) throw err;
    console.error('Payment confirmation failed:', err?.error || err);
    return res.status(502).json({ error: 'Could not confirm the payment with Razorpay yet' });
  }
  res.json({ ok: true, bookId: purchase.book_id });
});

// The signed-in user's order history.
router.get('/mine', requireAuth, async (req, res) => {
  const [rows] = await db().query(
    'SELECT id, book_id AS bookId, book_title AS bookTitle, amount, currency, status, created_at AS createdAt, paid_at AS paidAt FROM purchases WHERE user_id = ? AND status IN (\'paid\',\'refunded\') ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// ---------- webhook (called by Razorpay's servers, not the browser) ----------
// Mounted with a raw body parser in index.js: the signature is computed over the exact bytes Razorpay sent.
router.post('/webhook', async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const raw = Buffer.isBuffer(req.body) ? req.body : null;
  if (!raw || !verifyWebhookSignature(raw, signature)) return res.status(400).json({ error: 'Invalid signature' });

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const payment = event.payload?.payment?.entity;
  switch (event.event) {
    case 'payment.captured':
    case 'order.paid': {
      const purchase = payment && (await getPurchaseByOrder(payment.order_id));
      if (!purchase) break; // not one of ours
      if (Number(payment.amount) !== purchase.amount || payment.currency !== purchase.currency) {
        console.error(`Webhook amount mismatch for order ${purchase.razorpay_order_id}`);
        break;
      }
      if (payment.status === 'captured' && (await markPaid(purchase.razorpay_order_id, payment.id))) {
        console.log(`Webhook unlocked book ${purchase.book_id} for user ${purchase.user_id}`);
      }
      break;
    }
    case 'refund.processed':
    case 'refund.created': {
      // Fully refunded payments lose access. Partial refunds are ignored (decide a policy if you offer them).
      if (payment && Number(payment.amount_refunded) >= Number(payment.amount)) {
        await db().query("UPDATE purchases SET status='refunded' WHERE razorpay_payment_id = ? AND status='paid'", [payment.id]);
      }
      break;
    }
    default:
      break; // acknowledged but ignored
  }

  // Always 200 for authentic events so Razorpay doesn't keep retrying ones we don't care about.
  res.json({ ok: true });
});

module.exports = router;
