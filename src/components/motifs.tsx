import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, type IconName } from '@/components/icons';
import { colors } from '@/theme';

/**
 * Bhil / Pithora-inspired decoration, drawn with a handful of SVG paths each (a few elements in total, never one per dot),
 * memoized by size so it is built once. Purely decorative: hidden from screen readers.
 */
const HIDE = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

// ---------- dot border: rows of haldi dots and maroon triangles ----------
const UNIT = 24;
export const DOT_BORDER_HEIGHT = 16;

function dotBorderPaths(width: number) {
  const n = Math.ceil(width / UNIT) + 1;
  let dots = '';
  let tris = '';
  for (let i = 0; i < n; i++) {
    const x = i * UNIT;
    dots += circle(x + 4, 8, 2.5);
    tris += `M${x + 10} 13L${x + 16} 3L${x + 22} 13z`;
  }
  return { dots, tris };
}

/** Thin strip of haldi dots and kumkum triangles, like the border of a Pithora wall painting. */
export const DotBorder = React.memo(function DotBorder() {
  const { width } = useWindowDimensions();
  const { dots, tris } = useMemo(() => dotBorderPaths(width), [width]);
  return (
    <View {...HIDE} pointerEvents="none" style={styles.strip}>
      <Svg width={width} height={DOT_BORDER_HEIGHT} viewBox={`0 0 ${width} ${DOT_BORDER_HEIGHT}`}>
        <Path d={dots} fill={colors.haldi} />
        <Path d={tris} fill={colors.given} />
      </Svg>
    </View>
  );
});

// ---------- toran: hanging garland of leaves and marigolds ----------
export const TORAN_HEIGHT = 56;
const SEG = 40;

function toranPaths(width: number) {
  const n = Math.ceil(width / SEG) + 1;
  let string = 'M0 5';
  let leaves = '';
  let marigold = '';
  let tips = '';
  for (let i = 0; i < n; i++) {
    const x = i * SEG;
    string += `Q${x + SEG / 2} 15 ${x + SEG} 5`;
    // a leaf hangs from every knot; alternate long and short
    const len = i % 2 === 0 ? 38 : 28;
    leaves += `M${x} 5C${x - 9} 15 ${x - 8} ${len - 8} ${x} ${len}C${x + 8} ${len - 8} ${x + 9} 15 ${x} 5z`;
    tips += circle(x, len + 5, 3);
    // marigold between knots, sitting on the sagging string
    marigold += circle(x + SEG / 2, 11, 4.5);
  }
  return { string, leaves, marigold, tips };
}

/** Hanging leaf-and-marigold garland (toran) for the top of Home. */
export const Toran = React.memo(function Toran() {
  const { width } = useWindowDimensions();
  const p = useMemo(() => toranPaths(width), [width]);
  return (
    <View {...HIDE} pointerEvents="none" style={styles.strip}>
      <Svg width={width} height={TORAN_HEIGHT} viewBox={`0 0 ${width} ${TORAN_HEIGHT}`}>
        <Path d={p.string} stroke={colors.given} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d={p.leaves} fill={colors.success} />
        <Path d={p.marigold} fill={colors.haldi} />
        <Path d={p.tips} fill={colors.given} />
      </Svg>
    </View>
  );
});

// ---------- scattered yellow rice grains (wedding) ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grainsPath(width: number, height: number, count: number, seed: number) {
  const rand = rng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const a = rand() * Math.PI;
    const dx = Math.cos(a) * 7;
    const dy = Math.sin(a) * 7;
    const nx = -Math.sin(a) * 5;
    const ny = Math.cos(a) * 5;
    // a grain is a lens: two curves between the tips
    d += `M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}Q${(cx + nx).toFixed(1)} ${(cy + ny).toFixed(1)} ${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}Q${(cx - nx).toFixed(1)} ${(cy - ny).toFixed(1)} ${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}z`;
  }
  return d;
}

interface GrainProps {
  width: number;
  height: number;
  count?: number;
  seed?: number;
  opacity?: number;
}

/** Scattered haldi-coloured rice grains (pīle chāwal) used behind wedding events. Fills its parent when absolutely positioned. */
export const RiceGrains = React.memo(function RiceGrains({ width, height, count = 28, seed = 7, opacity = 0.9 }: GrainProps) {
  const d = useMemo(() => grainsPath(width, height, count, seed), [width, height, count, seed]);
  return (
    <View {...HIDE} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={d} fill={colors.haldi} />
      </Svg>
    </View>
  );
});

// ---------- empty-state picture ----------
const ART = 128;
const RING = 60;
const RING_LEN = 2 * Math.PI * RING;

/** Round picture for empty states: haldi-tint disc, a ring of dots, and one line icon in kumkum. */
export const EmptyArt = React.memo(function EmptyArt({ icon }: { icon: IconName }) {
  return (
    <View {...HIDE} style={styles.art}>
      <Svg width={ART} height={ART} viewBox={`0 0 ${ART} ${ART}`} style={StyleSheet.absoluteFill}>
        <Circle cx={ART / 2} cy={ART / 2} r={RING + 2} fill={colors.haldiTint} />
        <Circle
          cx={ART / 2}
          cy={ART / 2}
          r={RING - 4}
          fill="none"
          stroke={colors.haldi}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`0 ${(2 * Math.PI * (RING - 4)) / Math.round(RING_LEN / 9)}`}
        />
      </Svg>
      <Icon name={icon} size={56} color={colors.given} />
    </View>
  );
});

const styles = StyleSheet.create({
  strip: { alignSelf: 'stretch' },
  art: { width: ART, height: ART, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
