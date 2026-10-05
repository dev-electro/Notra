import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';

/**
 * Small hand-drawn-feeling line icons: 24x24 grid, 2px round-capped strokes, no fills (except tiny eye dots).
 * They replace emoji so every phone shows the same picture. Elements are created once (module level) and the component is memoized.
 * Colour comes from `color` through `currentColor`.
 */
const S = 'currentColor';
const dot = (cx: number, cy: number, r = 0.9) => <Circle cx={cx} cy={cy} r={r} fill={S} stroke="none" />;

const SHAPES = {
  // --- the four Home pictures ---
  write: (
    <>
      <Path d="M4 20l1.2-4.6L16 4.6a1.9 1.9 0 0 1 2.7 0l.7.7a1.9 1.9 0 0 1 0 2.7L8.6 18.8z" />
      <Path d="M14.2 6.4l3.4 3.4M13 21h7.5" />
    </>
  ),
  events: (
    // diya: clay lamp with a flame
    <>
      <Path d="M3.5 13.5h17c0 3.6-3.8 6.5-8.5 6.5s-8.5-2.9-8.5-6.5z" />
      <Path d="M12 3c2 2.4 3 4.2 3 6a3 3 0 0 1-6 0c0-1.8 1-3.6 3-6z" />
      <Path d="M8.5 22.2h7" />
    </>
  ),
  families: (
    <>
      <Circle cx={12} cy={7.5} r={3} />
      <Path d="M6 20c0-3.6 2.6-6 6-6s6 2.4 6 6" />
      <Circle cx={4.8} cy={10.5} r={2} />
      <Path d="M1.8 19.5c0-2.4 1.3-4 3.2-4.2" />
      <Circle cx={19.2} cy={10.5} r={2} />
      <Path d="M22.2 19.5c0-2.4-1.3-4-3.2-4.2" />
    </>
  ),
  hisaab: (
    // open diary
    <>
      <Path d="M12 6.5c-1.8-1.4-4.5-2-8-2v13c3.5 0 6.2.6 8 2 1.8-1.4 4.5-2 8-2v-13c-3.5 0-6.2.6-8 2z" />
      <Path d="M12 6.5v13M6.2 8.5h3M6.2 11.5h3M14.8 8.5h3M14.8 11.5h3" />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2.5l1.6 2.3 2.7-.7.9 2.6 2.6.9-.7 2.7 2.4 1.7-2.3 1.6.7 2.7-2.6.9-.9 2.6-2.7-.7L12 21.5l-1.6-2.3-2.7.7-.9-2.6-2.6-.9.7-2.7L2.5 12l2.3-1.6-.7-2.7 2.6-.9.9-2.6 2.7.7z" />
    </>
  ),

  // --- everyday controls ---
  back: <Path d="M19 12H5M11 6l-6 6 6 6" />,
  mic: (
    <>
      <Path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z" />
      <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  speaker: (
    <>
      <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <Path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7" />,
  share: (
    <>
      <Circle cx={6} cy={12} r={2.5} />
      <Circle cx={18} cy={6} r={2.5} />
      <Circle cx={18} cy={18} r={2.5} />
      <Path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  search: (
    <>
      <Circle cx={10.5} cy={10.5} r={6} />
      <Path d="M15.2 15.2L20 20" />
    </>
  ),
  backspace: (
    <>
      <Path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
      <Path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </>
  ),
  chevron: <Path d="M9 5l7 7-7 7" />,
  arrowDown: <Path d="M12 4v15M6 13l6 6 6-6" />,
  arrowUp: <Path d="M12 20V5M6 11l6-6 6 6" />,
  undo: <Path d="M8 6l-4 4 4 4M4 10h10a5 5 0 0 1 0 10h-3" />,
  refresh: <Path d="M19 8a8 8 0 0 0-14 1M5 4v5h5M5 16a8 8 0 0 0 14-1M19 20v-5h-5" />,

  // --- money ---
  moneyIn: (
    // arrow dropping into an open palm
    <>
      <Path d="M4 14v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14" />
      <Path d="M12 3.5v10M8 9.5l4 4 4-4" />
    </>
  ),
  moneyOut: (
    <>
      <Path d="M4 14v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14" />
      <Path d="M12 13.5v-10M8 7.5l4-4 4 4" />
    </>
  ),
  cash: (
    <>
      <Path d="M3 7h18v10H3z" />
      <Circle cx={12} cy={12} r={2.5} />
      <Path d="M6.5 10v.1M17.5 14v.1" />
    </>
  ),
  phone: (
    <>
      <Path d="M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <Path d="M11 18h2" />
    </>
  ),

  // --- gifts in kind ---
  grain: (
    // sack of grain
    <>
      <Path d="M9 3.5h6M9 3.5c-.3 1.6-1.2 2.3-2.2 3.2C5 8.3 4 10.5 4 13c0 4.5 3 7.5 8 7.5s8-3 8-7.5c0-2.5-1-4.7-2.8-6.3-1-.9-1.9-1.6-2.2-3.2" />
      <Path d="M8.8 6.8c2 .9 4.4.9 6.4 0M12 11v6.5M12 13.2l2-1.4M12 15.6l-2-1.4" />
    </>
  ),
  ghee: (
    // clay pot
    <>
      <Path d="M8.5 4h7M9 4v2.2M15 4v2.2" />
      <Path d="M9 6.2C5.5 7.5 4.5 10 4.5 12.5c0 4.2 3 7 7.5 7s7.5-2.8 7.5-7c0-2.5-1-5-4.5-6.3" />
      <Path d="M8.5 21h7M5.2 12.5h13.6" />
    </>
  ),
  goat: (
    <>
      <Path d="M8 9c0-1.5 1-2.5 4-2.5s4 1 4 2.5l-1 6.5c-.3 1.6-1.5 2.5-3 2.5s-2.7-.9-3-2.5z" />
      <Path d="M8 8.5C5.5 8.5 4 6.5 4.5 4c1.5 0 3 1 3.8 2.6M16 8.5c2.5 0 4-2 3.5-4.5-1.5 0-3 1-3.8 2.6" />
      <Path d="M7.8 10.8L4 12M16.2 10.8l3.8 1.2M12 18v3" />
      {dot(10, 11.5)}
      {dot(14, 11.5)}
    </>
  ),
  utensils: (
    // cooking pot with lid
    <>
      <Path d="M5 10.5h14v5.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <Path d="M5 13H3M19 13h2" />
      <Path d="M7 10.5c0-2 2-3.5 5-3.5s5 1.5 5 3.5M12 7V5" />
    </>
  ),

  // --- occasions ---
  house: (
    <>
      <Path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h12V10" />
      <Path d="M10 19.5v-5h4v5" />
    </>
  ),
  grihapravesh: (
    // new house with a lit diya flame at the door
    <>
      <Path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h12V10" />
      <Path d="M10 19.5v-3.5a2 2 0 0 1 4 0v3.5" />
      <Path d="M12 7.4c.9 1 1.4 1.8 1.4 2.5a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.5z" />
    </>
  ),
  mundan: (
    // a child's face with the small tuft (choti) kept at the top
    <>
      <Circle cx={12} cy={13.5} r={6.5} />
      <Path d="M12 7V4.6c0-1 1.1-1.7 2-1" />
      <Path d="M9.8 15.8c.9 1 3.5 1 4.4 0" />
      <Path d="M5.5 13.5H4M20 13.5h-1.5" />
      {dot(9.6, 12.4)}
      {dot(14.4, 12.4)}
    </>
  ),
  kalash: (
    // wedding pot with mango leaves and a coconut
    <>
      <Path d="M9 11V9.5h6V11" />
      <Path d="M7.5 11c-1.5 1.5-2.5 3-2.5 5 0 2.8 3 4.5 7 4.5s7-1.7 7-4.5c0-2-1-3.5-2.5-5z" />
      <Circle cx={12} cy={5.8} r={2.2} />
      <Path d="M10.2 8.4C8.2 8 6.7 6.6 6.3 4.4c2.2.2 3.6 1.4 4.2 3.2M13.8 8.4c2-.4 3.5-1.8 3.9-4-2.2.2-3.6 1.4-4.2 3.2" />
    </>
  ),
  medical: (
    // cross with a leaf
    <>
      <Path d="M9.5 6.5h4v4.5H18v4h-4.5v4.5h-4V15H5v-4h4.5z" />
      <Path d="M17 3.5c2.5.2 3.8 1.5 4 4-2.5-.2-3.8-1.5-4-4z" />
    </>
  ),
  star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />,

  // --- settings and misc ---
  lock: (
    <>
      <Path d="M6.5 11h11v9h-11z" />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      {dot(12, 15.5, 1.1)}
    </>
  ),
  unlock: (
    <>
      <Path d="M6.5 11h11v9h-11z" />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2" />
      {dot(12, 15.5, 1.1)}
    </>
  ),
  cloud: <Path d="M7 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.2 4.7 4.7 0 0 1 0 9.2z" />,
  doc: (
    <>
      <Path d="M6.5 3.5h7l4 4v13h-11z" />
      <Path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" />
    </>
  ),
  trash: <Path d="M5 7h14M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  camera: (
    <>
      <Path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <Circle cx={12} cy={13.2} r={3.2} />
    </>
  ),
  image: (
    <>
      <Path d="M4 5h16v14H4z" />
      <Path d="M4 16l5-5 4 4 3-3 4 4" />
      <Circle cx={15.5} cy={9} r={1.5} />
    </>
  ),
  calendar: <Path d="M4 6h16v14H4zM4 10.5h16M8 3.5v4M16 3.5v4" />,
  warn: <Path d="M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.4v.1" />,
  logout: <Path d="M10 4.5H5v15h5M14 8l4 4-4 4M18 12H9" />,
} satisfies Record<string, React.ReactElement>;

export type IconName = keyof typeof SHAPES;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** One line icon. Decorative: the button or row that holds it carries the spoken label. */
export const Icon = React.memo(function Icon({ name, size = 28, color = colors.ink, strokeWidth = 2 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={S}
      color={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {SHAPES[name]}
    </Svg>
  );
});

/** Pictures for the "in kind" gifts (सामान), keyed like IN_KIND_KINDS in core. */
export const IN_KIND_ICON: Record<string, IconName> = {
  grain: 'grain',
  ghee: 'ghee',
  goat: 'goat',
  utensil: 'utensils',
  other: 'star',
};

export const ICON_NAMES = Object.keys(SHAPES) as IconName[];
