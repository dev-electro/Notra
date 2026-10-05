/**
 * Heuristic parser for spoken/typed Hindi + Hinglish entries. Never throws.
 *   "Ramesh, Kalu ka beta, Chhoti Sarwan, 501"
 *   "रमेश कालू का बेटा छोटी सरवन 501"
 *   "Suresh ne paanch sau ek diye"
 * Heuristics (documented limits):
 *  - commas/danda split segments; without commas the father is the single word before "ka beta".
 *  - with no relation marker: 3+ segments = name, father, village; 2 segments = name, village.
 *  - the amount is the last run of number tokens (a run containing digits wins over word-only runs).
 */

export interface ParsedVoiceEntry {
  name?: string;
  fatherName?: string;
  village?: string;
  amountRupees?: number;
  /** 0..1 */
  confidence: number;
}

/** Lookup-normalise: lowercase, strip Devanagari nukta/chandrabindu/anusvara, fold Latin spelling variants. */
function norm(s: string): string {
  let t = s.toLowerCase().normalize('NFD').replace(/[़ँं]/g, '');
  if (/[a-z]/.test(t)) {
    t = t
      .replace(/chh/g, 'ch')
      .replace(/aa/g, 'a')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/w/g, 'v')
      .replace(/z/g, 'j')
      .replace(/(.)\1+/g, '$1');
  }
  return t;
}

const DEV_DIGITS = '०१२३४५६७८९';
function asciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
}

type NumWord = { v: number; kind: 'unit' | 'mult' | 'frac' };
const NUMBER_WORDS: Record<string, NumWord> = {};
function defNum(v: number, kind: NumWord['kind'], ...words: string[]) {
  for (const w of words) NUMBER_WORDS[norm(w)] = { v, kind };
}
defNum(0, 'unit', 'shunya', 'zero', 'शून्य');
defNum(1, 'unit', 'ek', 'एक');
defNum(2, 'unit', 'do', 'दो');
defNum(3, 'unit', 'teen', 'tin', 'तीन');
defNum(4, 'unit', 'char', 'chaar', 'चार');
defNum(5, 'unit', 'paanch', 'panch', 'pach', 'पाँच', 'पांच');
defNum(6, 'unit', 'chhe', 'chah', 'chhah', 'छह', 'छः', 'छै', 'छे', 'छ');
defNum(7, 'unit', 'saat', 'sat', 'सात');
defNum(8, 'unit', 'aath', 'ath', 'आठ');
defNum(9, 'unit', 'nau', 'नौ');
defNum(10, 'unit', 'das', 'दस');
defNum(11, 'unit', 'gyarah', 'gyarha', 'giyarah', 'ग्यारह');
defNum(12, 'unit', 'barah', 'baarah', 'बारह');
defNum(13, 'unit', 'terah', 'तेरह');
defNum(14, 'unit', 'chaudah', 'chaudaha', 'चौदह');
defNum(15, 'unit', 'pandrah', 'pandraha', 'pandra', 'पंद्रह', 'पन्द्रह');
defNum(16, 'unit', 'solah', 'sola', 'सोलह');
defNum(17, 'unit', 'satrah', 'सत्रह');
defNum(18, 'unit', 'atharah', 'athaarah', 'अठारह');
defNum(19, 'unit', 'unnis', 'unees', 'उन्नीस');
defNum(20, 'unit', 'bees', 'bis', 'बीस');
defNum(21, 'unit', 'ikkis', 'ikis', 'इक्कीस');
defNum(25, 'unit', 'pachchis', 'pachis', 'पच्चीस');
defNum(30, 'unit', 'tees', 'tis', 'तीस');
defNum(31, 'unit', 'ikattis', 'इकतीस');
defNum(40, 'unit', 'chalis', 'chaalis', 'चालीस');
defNum(41, 'unit', 'iktalis', 'इकतालीस');
defNum(50, 'unit', 'pachas', 'pachaas', 'पचास');
defNum(51, 'unit', 'ikyavan', 'ekyavan', 'ikyavn', 'ikavan', 'ekavan', 'इक्यावन', 'एकावन', 'इक्यावन');
defNum(60, 'unit', 'saath', 'sath', 'साठ');
defNum(61, 'unit', 'iksath', 'ikyasath', 'इकसठ');
defNum(70, 'unit', 'sattar', 'सत्तर');
defNum(80, 'unit', 'assi', 'अस्सी');
defNum(90, 'unit', 'nabbe', 'nabbay', 'नब्बे');
defNum(100, 'mult', 'sau', 'सौ', 'sow');
defNum(1000, 'mult', 'hazaar', 'hajar', 'hazar', 'hajaar', 'हज़ार', 'हजार');
defNum(100000, 'mult', 'lakh', 'lac', 'लाख');
defNum(2.5, 'frac', 'dhai', 'dhaai', 'ढाई');
defNum(1.5, 'frac', 'dedh', 'डेढ़', 'डेढ');
defNum(1.25, 'frac', 'sava', 'sawa', 'सवा');

const CURRENCY_FILLER = new Set(
  [
    'rupaye', 'rupay', 'rupaya', 'rupees', 'rupee', 'rupe', 'rs', 'inr', 'rupiya', 'रुपये', 'रुपए', 'रुपया', 'रुपयें', 'रु', '₹',
    'diye', 'diya', 'di', 'de', 'dena', 'liye', 'liya', 'li', 'hai', 'hain', 'gaye', 'gaya', 'aaye', 'aaya', 'tha',
    'दिए', 'दिये', 'दिया', 'दी', 'दे', 'लिए', 'लिये', 'लिया', 'है', 'हैं', 'था', 'दिए।',
  ].map(norm),
);
const NE_KO = new Set(['ne', 'ko', 'ने', 'को'].map(norm));
const KA = new Set(['ka', 'ke', 'ki', 'का', 'के', 'की'].map(norm));
const CHILD = new Set(
  ['beta', 'bete', 'beti', 'ladka', 'ladke', 'ladki', 'putra', 'putri', 'bacha', 'बेटा', 'बेटे', 'बेटी', 'लड़का', 'लड़के', 'लड़की', 'पुत्र', 'पुत्री'].map(norm),
);
const SON_OF = new Set(['s/o', 'd/o', 'सुपुत्र'].map(norm));
const VILLAGE_KW = new Set(['gaon', 'gav', 'gaanv', 'gam', 'village', 'गाँव', 'गांव', 'गाव', 'ग्राम'].map(norm));
const TRAIL = new Set(['se', 'ka', 'ke', 'ki', 'से', 'का', 'के', 'की', 'वाले', 'vale', 'wale'].map(norm));

type Tok = { raw: string; n: string; type: 'digits' | 'word' | 'sep' };

function tokenize(text: string): Tok[] {
  const src = asciiDigits(text.normalize('NFC'));
  const re = /\d+(?:,\d{2,3})*(?:\.\d+)?|[a-zA-Z]+(?:\/[a-zA-Z]+)?|[ऀ-ॿ]+|₹|[,;।|\n]|\./g;
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const raw = m[0];
    if (/^\d/.test(raw)) toks.push({ raw, n: raw, type: 'digits' });
    else if (/^[,;।|\n]$/.test(raw)) toks.push({ raw, n: raw, type: 'sep' });
    else if (raw === '.') continue;
    else toks.push({ raw, n: norm(raw), type: 'word' });
  }
  return toks;
}

function numWord(t: Tok): NumWord | undefined {
  return t.type === 'word' ? NUMBER_WORDS[t.n] : undefined;
}
const isNumTok = (t: Tok) => t.type === 'digits' || numWord(t) !== undefined;

interface Run { start: number; end: number; value: number; hasDigits: boolean }

function evalRun(toks: Tok[]): number {
  let total = 0;
  let cur = 0;
  for (const t of toks) {
    if (t.type === 'digits') {
      cur += parseFloat(t.raw.replace(/,/g, ''));
      continue;
    }
    const w = numWord(t)!;
    if (w.kind === 'unit') cur += w.v;
    else if (w.kind === 'frac') cur += w.v; // multiplied by the following sau/hazaar
    else if (w.v === 100) cur = (cur === 0 ? 1 : cur) * 100;
    else {
      total += (cur === 0 ? 1 : cur) * w.v;
      cur = 0;
    }
  }
  return Math.round(total + cur);
}

function findRuns(toks: Tok[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < toks.length) {
    if (!isNumTok(toks[i])) { i++; continue; }
    let j = i;
    while (j + 1 < toks.length && isNumTok(toks[j + 1])) {
      const prev = toks[j];
      const next = toks[j + 1];
      const nextIsMult = numWord(next)?.kind === 'mult';
      // "de do 501": a digit token never glues onto a preceding number word; and a word never onto digits unless a multiplier.
      if (next.type === 'digits' && prev.type === 'word') break;
      if (prev.type === 'digits' && next.type === 'word' && !nextIsMult) break;
      j++;
    }
    const slice = toks.slice(i, j + 1);
    runs.push({ start: i, end: j, value: evalRun(slice), hasDigits: slice.some((t) => t.type === 'digits') });
    i = j + 1;
  }
  return runs;
}

function cap(words: string[]): string | undefined {
  const s = words
    .map((w) => (/^[a-zA-Z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
    .trim();
  return s || undefined;
}

function cleanTrail(words: Tok[]): Tok[] {
  const w = [...words];
  while (w.length && TRAIL.has(w[w.length - 1].n)) w.pop();
  return w;
}

export function parseVoiceEntry(transcript: string): ParsedVoiceEntry {
  try {
    if (typeof transcript !== 'string' || !transcript.trim()) return { confidence: 0 };
    const toks = tokenize(transcript);
    const result: ParsedVoiceEntry = { confidence: 0 };

    // Amount
    const runs = findRuns(toks);
    const digitRuns = runs.filter((r) => r.hasDigits);
    const chosen = (digitRuns.length ? digitRuns : runs).slice(-1)[0];
    let rest = toks;
    if (chosen) {
      if (chosen.value > 0) result.amountRupees = chosen.value;
      rest = [...toks.slice(0, chosen.start), { raw: ',', n: ',', type: 'sep' }, ...toks.slice(chosen.end + 1)];
    }

    // Segments of words, dropping currency/verb filler and any stray numbers
    const segs: Tok[][] = [[]];
    for (const t of rest) {
      if (t.type === 'sep') {
        if (segs[segs.length - 1].length) segs.push([]);
      } else if (t.type === 'word' && !CURRENCY_FILLER.has(t.n)) {
        segs[segs.length - 1].push(t);
      }
    }
    const segments = segs.filter((s) => s.length);

    // Relation marker: "<father> ka beta" or "s/o <father>"
    let markerSeg = -1;
    let markerIdx = -1;
    let markerLen = 0;
    let fatherAfter = false;
    outer: for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      for (let i = 0; i < seg.length; i++) {
        if (SON_OF.has(seg[i].n)) { markerSeg = s; markerIdx = i; markerLen = 1; fatherAfter = true; break outer; }
        if (seg[i].n === 'son' && seg[i + 1]?.n === 'of') { markerSeg = s; markerIdx = i; markerLen = 2; fatherAfter = true; break outer; }
        if (KA.has(seg[i].n) && seg[i + 1] && CHILD.has(seg[i + 1].n)) { markerSeg = s; markerIdx = i; markerLen = 2; break outer; }
      }
    }

    let nameToks: Tok[] = [];
    let fatherToks: Tok[] = [];
    let villageToks: Tok[] = [];

    const afterMarker = (): Tok[] => {
      const seg = segments[markerSeg];
      const same = seg.slice(markerIdx + markerLen);
      return same.length ? same : segments[markerSeg + 1] ?? [];
    };

    if (markerSeg >= 0) {
      const seg = segments[markerSeg];
      const before = seg.slice(0, markerIdx);
      const earlier = segments.slice(0, markerSeg);
      if (!fatherAfter) {
        if (earlier.length) {
          nameToks = earlier[0];
          fatherToks = before;
        } else if (before.length > 1) {
          nameToks = before.slice(0, -1);
          fatherToks = before.slice(-1);
        } else {
          fatherToks = before; // father only
        }
        villageToks = afterMarker();
      } else {
        nameToks = before.length ? before : earlier[0] ?? [];
        const after = seg.slice(markerIdx + markerLen);
        if (after.length <= 2) {
          fatherToks = after;
          villageToks = segments[markerSeg + 1] ?? [];
        } else {
          fatherToks = after.slice(0, 1);
          villageToks = after.slice(1);
        }
      }
    } else if (segments.length) {
      const first = segments[0];
      const cut = first.findIndex((t) => NE_KO.has(t.n));
      if (cut >= 0) {
        nameToks = first.slice(0, cut);
        villageToks = first.slice(cut + 1);
      } else if (segments.length >= 3) {
        [nameToks, fatherToks, villageToks] = segments;
      } else if (segments.length === 2) {
        [nameToks, villageToks] = segments;
      } else {
        nameToks = first;
      }
    }

    // Explicit village keyword anywhere (gaon/village) refines the village
    const kwHaystack = markerSeg >= 0 ? villageToks : [...nameToks, ...villageToks];
    const kw = kwHaystack.findIndex((t) => VILLAGE_KW.has(t.n));
    if (kw >= 0) {
      const afterKw = kwHaystack.slice(kw + 1).filter((t) => !NE_KO.has(t.n));
      const beforeKw = kwHaystack.slice(0, kw).slice(-2);
      villageToks = afterKw.length ? afterKw : beforeKw;
    }
    villageToks = cleanTrail(villageToks.filter((t) => !NE_KO.has(t.n) && !VILLAGE_KW.has(t.n)));
    nameToks = cleanTrail(nameToks.filter((t) => !NE_KO.has(t.n) && !VILLAGE_KW.has(t.n)));
    fatherToks = cleanTrail(fatherToks);

    result.name = cap(nameToks.map((t) => t.raw));
    result.fatherName = cap(fatherToks.map((t) => t.raw));
    result.village = cap(villageToks.map((t) => t.raw));

    let c = 0;
    if (result.amountRupees !== undefined) c += 0.4;
    if (result.name) c += 0.3;
    if (result.fatherName) c += 0.15;
    if (result.village) c += 0.15;
    result.confidence = Math.round(c * 100) / 100;
    return result;
  } catch {
    return { confidence: 0 };
  }
}
