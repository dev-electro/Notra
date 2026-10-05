/**
 * Hindi number-to-words for the amount shown under the number pad ("पाँच सौ एक रुपये"), so a person who cannot read digits well
 * can hear/see the sum in words. Pure TypeScript. Supports 0 to 99,99,99,999 (crore range) with Indian units.
 */
const BELOW_100 = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ',
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
  'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
  'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास',
  'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
  'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
  'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी',
  'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

const UNITS: readonly [number, string][] = [
  [10_000_000, 'करोड़'],
  [100_000, 'लाख'],
  [1_000, 'हज़ार'],
  [100, 'सौ'],
];

/** The number alone in Hindi words: 501 -> "पाँच सौ एक". Returns '' for anything that is not a whole number >= 0. */
export function numberToHindiWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  let rest = Math.floor(n);
  if (rest === 0) return BELOW_100[0]!;
  const parts: string[] = [];
  for (const [size, name] of UNITS) {
    if (rest >= size) {
      const count = Math.floor(rest / size);
      // "करोड़" can itself have a count above 99 only beyond our range; recurse so it still reads sensibly.
      parts.push(`${numberToHindiWords(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(BELOW_100[rest]!);
  return parts.join(' ');
}

/** Amount in words for the number pad: 501 -> "पाँच सौ एक रुपये", 1 -> "एक रुपया", 0 -> "" (nothing typed yet). */
export function rupeesInWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees <= 0) return '';
  const r = Math.floor(rupees);
  return `${numberToHindiWords(r)} ${r === 1 ? 'रुपया' : 'रुपये'}`;
}
