// Prices arrive as integers in the currency's smallest unit (paise for INR).
export function formatPrice(minorUnits, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
  }).format(minorUnits / 100)
}
