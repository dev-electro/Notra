/** Diary look: off-white ruled paper, red and blue ink, large type, big touch targets. */
export const colors = {
  paper: '#FBF7EC',
  rule: '#CFD8E6', // pale blue ruled lines
  margin: '#E8A9A0', // red margin line
  inkBlue: '#1F3A8A',
  inkRed: '#B3261E',
  text: '#1B1B1F',
  textMuted: '#5B5B66',
  card: '#FFFDF6',
  border: '#D9D2BE',
  neutral: '#6B7280',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const type = {
  title: { fontSize: 32, lineHeight: 44, fontWeight: '700' as const },
  label: { fontSize: 26, lineHeight: 36, fontWeight: '700' as const },
  amount: { fontSize: 40, lineHeight: 52, fontWeight: '700' as const },
  body: { fontSize: 20, lineHeight: 30, fontWeight: '400' as const },
} as const;

/** Notebook line pitch; content should sit on multiples of this where practical. */
export const RULE_PITCH = 36;
/** Minimum touch target (dp). Material suggests 48; we go bigger for older users. */
export const MIN_TOUCH = 64;

export const theme = { colors, spacing, type, RULE_PITCH, MIN_TOUCH };
export type Theme = typeof theme;
