const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('./config');

let client;

const isConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

// Created lazily so the app still runs (browsing, reading free books) before keys are configured.
function getClient() {
  if (!isConfigured()) {
    const err = new Error('Payments are not set up yet. Please try again later.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  client ??= new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return client;
}

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Constant-time comparison of two hex digests.
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Signature the Checkout popup hands back to the browser after a successful payment.
const verifyCheckoutSignature = (orderId, paymentId, signature) =>
  safeEqualHex(hmacHex(config.razorpay.keySecret, `${orderId}|${paymentId}`), signature);

// Signature Razorpay sends in the X-Razorpay-Signature header, computed over the raw request body.
const verifyWebhookSignature = (rawBody, signature) =>
  Boolean(config.razorpay.webhookSecret) && safeEqualHex(hmacHex(config.razorpay.webhookSecret, rawBody), signature);

module.exports = { isConfigured, getClient, verifyCheckoutSignature, verifyWebhookSignature };
