import { formatINR } from './money';
import type { Increment } from './types';

/** Hindi explanation for the suggested next amount, e.g. "उन्होंने आखिरी बार ₹501 दिए। +₹51 = ₹551". */
export function explainSuggestion(lastReceivedPaise: number, suggestedPaise: number | null, increment: Increment): string {
  if (suggestedPaise === null || lastReceivedPaise <= 0) {
    return 'इनसे अभी कुछ आया नहीं है, इसलिए कोई सुझाव नहीं।';
  }
  const inc = increment.type === 'FIXED' ? `+₹${increment.rupees}` : `+${increment.pct}%`;
  return `उन्होंने आखिरी बार ${formatINR(lastReceivedPaise)} दिए। ${inc} जोड़कर शगुन की गिनती (1 पर खत्म) में ${formatINR(suggestedPaise)}।`;
}
