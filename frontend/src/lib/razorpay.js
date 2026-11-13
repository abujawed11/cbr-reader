import { createOrder, verifyPayment } from '../api'

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export class PaymentCancelled extends Error {
  constructor() {
    super('Payment cancelled')
    this.name = 'PaymentCancelled'
  }
}

let scriptPromise
function loadCheckoutScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.onload = resolve
    script.onerror = () => {
      scriptPromise = null // allow a retry
      reject(new Error('Could not load the payment window. Check your connection and try again.'))
    }
    document.body.appendChild(script)
  })
  return scriptPromise
}

// Opens Razorpay Checkout for a book. Resolves once the server has confirmed the payment.
// Rejects with PaymentCancelled if the user closes the window, or an Error with a readable message.
export async function payForBook(book) {
  await loadCheckoutScript()
  const order = await createOrder(book.id) // the server decides the price; we only say which book

  return new Promise((resolve, reject) => {
    let lastFailure = null

    const checkout = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Bookshelf',
      description: book.title,
      prefill: { name: order.user.name, email: order.user.email },
      theme: { color: '#6f5ef0' },
      handler: async (response) => {
        try {
          await verifyPayment(response)
          resolve()
        } catch (err) {
          reject(new Error(`${err.message}. If money was deducted, the book will unlock shortly; otherwise contact support.`))
        }
      },
      modal: {
        // A failed attempt leaves the window open so the user can retry, so we only report the failure
        // if they give up and close it.
        ondismiss: () => reject(lastFailure ? new Error(lastFailure) : new PaymentCancelled()),
      },
    })

    checkout.on('payment.failed', (response) => {
      lastFailure = response?.error?.description || 'The payment failed. Please try again.'
    })
    checkout.open()
  })
}
