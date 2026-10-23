/**
 * Formats a monetary number in Indian Rupee conventions (Lakhs and Crores).
 * Example: 125000 -> ₹1,25,000.00
 * Negative: -500 -> -₹500.00
 */
export function formatINR(amount: number, showDecimals: boolean = true): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(absAmount);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Format date in Indian context (Asia/Kolkata)
 */
export function formatIndianDate(dateString: string): string {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
