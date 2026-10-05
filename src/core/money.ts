export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Indian digit grouping (3 then 2s): 100001 -> "1,00,001". Accepts integer rupees as a string/number. */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Format integer paise as Indian-grouped rupees: 10000100 -> "₹1,00,001". Paise shown only when non-zero. */
export function formatINR(paise: number, opts: { symbol?: boolean } = {}): string {
  const symbol = opts.symbol === false ? '' : '₹';
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const neg = safe < 0;
  const abs = Math.abs(safe);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  let out = groupIndian(String(rupees));
  if (rem !== 0) out += `.${String(rem).padStart(2, '0')}`;
  return `${neg ? '-' : ''}${symbol}${out}`;
}

/** Smallest whole-rupee value >= x of the form 10k+1 (shagun number). 550->551, 600->601, 501->501. */
export function roundUpToShagun(rupees: number): number {
  const r = Math.ceil(rupees);
  return r + ((11 - (r % 10)) % 10);
}
