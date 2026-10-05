import { matchHouseholds, type HouseholdMatch } from './match';
import { parseVoiceEntry, type ParsedVoiceEntry } from './voice';
import type { Household } from './types';

export interface ResolvedVoiceEntry {
  parsed: ParsedVoiceEntry;
  matches: HouseholdMatch[];
  /** Set only when exactly one household is clearly the best match; the user still confirms. */
  best?: Household;
}

/** Transcript -> parsed fields -> candidate households. Pure: the screen shows these for the user to confirm. */
export function resolveVoiceEntry(transcript: string, households: readonly Household[]): ResolvedVoiceEntry {
  const parsed = parseVoiceEntry(transcript);
  const matches = matchHouseholds(
    { name: parsed.name, fatherName: parsed.fatherName, village: parsed.village },
    households,
  );
  const [first, second] = matches;
  const best = first && first.score >= 0.8 && (!second || first.score - second.score >= 0.1) ? first.household : undefined;
  return { parsed, matches, best };
}
