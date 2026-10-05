import type { TextStyle } from 'react-native';

/**
 * Design tokens: the ONLY place colours, sizes, fonts and spacing are defined. Screens use these names, never raw values.
 * Palette comes from village life: paper, indigo ink, kumkum, haldi, mehendi.
 *
 * Meaning is never carried by colour alone: मिला/आया (received) = indigo + down arrow + the word,
 * दिया/गया (given) = kumkum + up arrow + the word.
 */
export const colors = {
  /** Page background (handmade paper). */
  paper: '#FBF6EC',
  /** Cards, inputs and plain buttons. */
  card: '#FFFDF8',
  /** Primary text (warm near-black). */
  ink: '#2A2118',
  /** Secondary text (soft ink-grey). */
  muted: '#5A5148',
  /** 1px dividers and card borders. */
  hairline: '#E7DCC8',
  /** Borders of text boxes (must be visible: >= 3:1 on paper). */
  outline: '#8A7A5E',

  /** मिला / आया (received): indigo ink. */
  received: '#1F3A93',
  receivedTint: '#E8ECF8',
  /** दिया / गया (given): kumkum maroon. */
  given: '#9E2A2B',
  givenTint: '#F7E7E4',
  /** Haldi yellow: the one primary button colour and the accent. */
  haldi: '#E8A317',
  haldiTint: '#FBEFD0',
  /** Text on haldi (dark, never white). */
  onHaldi: '#2A2118',
  /** Mehendi green: success. Use `successInk` for text on light backgrounds (the base green is below 4.5:1 there). */
  success: '#4B7F52',
  successInk: '#2F5A36',
  successTint: '#E6F0E4',
  /** Text on solid indigo / kumkum / mehendi fills. */
  onSolid: '#FFFDF8',
} as const;

/** 8-pt grid (xs is the half step). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { card: 16, button: 16, pill: 999 } as const;

/** Hairline border width used on cards and plain buttons. */
export const BORDER = 1;
/** Coloured outline width for tone buttons (indigo / kumkum). */
export const BORDER_TONE = 2;

/** Minimum touch target (dp), bigger than Material's 48 for older hands. */
export const MIN_TOUCH = 64;
/** Screen side padding. */
export const GUTTER = spacing.md;
/** Press feedback duration (ms). */
export const PRESS_MS = 150;

/**
 * One Devanagari family, two weights (Mukta Medium 500 / Bold 700), subset to Devanagari + Latin + digits + rupee sign.
 * Never set fontWeight with these: the weight is the file. (Android would fake-bold the Bold file again.)
 */
export const fonts = { medium: 'Mukta-Medium', bold: 'Mukta-Bold' } as const;

const t = (s: TextStyle): TextStyle => s;
const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/** Type scale (sp). Nothing below 18. Line heights are ~1.45x because Devanagari matras need headroom. */
export const type = {
  amountXL: t({ fontFamily: fonts.bold, fontSize: 56, lineHeight: 72, fontVariant: tabular }),
  amount: t({ fontFamily: fonts.bold, fontSize: 40, lineHeight: 56, fontVariant: tabular }),
  title: t({ fontFamily: fonts.bold, fontSize: 26, lineHeight: 38 }),
  heading: t({ fontFamily: fonts.bold, fontSize: 22, lineHeight: 32 }),
  button: t({ fontFamily: fonts.bold, fontSize: 20, lineHeight: 28 }),
  body: t({ fontFamily: fonts.medium, fontSize: 20, lineHeight: 30 }),
  bodyBold: t({ fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 }),
  caption: t({ fontFamily: fonts.medium, fontSize: 18, lineHeight: 26 }),
  captionBold: t({ fontFamily: fonts.bold, fontSize: 18, lineHeight: 26 }),
  key: t({ fontFamily: fonts.bold, fontSize: 32, lineHeight: 44, fontVariant: tabular }),
  money: t({ fontFamily: fonts.bold, fontSize: 24, lineHeight: 34, fontVariant: tabular }),
} as const;

/** Every text-on-background pair the app uses, with the minimum contrast ratio it must meet (checked in theme.test.ts). */
export const textPairs: readonly { name: string; fg: string; bg: string; min: number }[] = [
  { name: 'ink on paper', fg: colors.ink, bg: colors.paper, min: 4.5 },
  { name: 'ink on card', fg: colors.ink, bg: colors.card, min: 4.5 },
  { name: 'muted on paper', fg: colors.muted, bg: colors.paper, min: 4.5 },
  { name: 'muted on card', fg: colors.muted, bg: colors.card, min: 4.5 },
  { name: 'muted on haldiTint', fg: colors.muted, bg: colors.haldiTint, min: 4.5 },
  { name: 'ink on haldiTint', fg: colors.ink, bg: colors.haldiTint, min: 4.5 },
  { name: 'received on paper', fg: colors.received, bg: colors.paper, min: 4.5 },
  { name: 'received on card', fg: colors.received, bg: colors.card, min: 4.5 },
  { name: 'received on receivedTint', fg: colors.received, bg: colors.receivedTint, min: 4.5 },
  { name: 'given on paper', fg: colors.given, bg: colors.paper, min: 4.5 },
  { name: 'given on card', fg: colors.given, bg: colors.card, min: 4.5 },
  { name: 'given on givenTint', fg: colors.given, bg: colors.givenTint, min: 4.5 },
  { name: 'onHaldi on haldi', fg: colors.onHaldi, bg: colors.haldi, min: 4.5 },
  { name: 'onSolid on received', fg: colors.onSolid, bg: colors.received, min: 4.5 },
  { name: 'onSolid on given', fg: colors.onSolid, bg: colors.given, min: 4.5 },
  { name: 'onSolid on success', fg: colors.onSolid, bg: colors.success, min: 4.5 },
  { name: 'successInk on paper', fg: colors.successInk, bg: colors.paper, min: 4.5 },
  { name: 'successInk on successTint', fg: colors.successInk, bg: colors.successTint, min: 4.5 },
  { name: 'card on ink (toast)', fg: colors.card, bg: colors.ink, min: 4.5 },
  // Non-text: text-box borders must be a visible shape (3:1). Haldi is only ever a fill behind dark text, never text itself.
  { name: 'outline on paper (box border)', fg: colors.outline, bg: colors.paper, min: 3 },
];

export const theme = { colors, spacing, radius, type, fonts, MIN_TOUCH, GUTTER };
export type Theme = typeof theme;
