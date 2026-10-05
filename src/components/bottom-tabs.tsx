import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { AdBanner } from '@/ads/AdBanner';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, colors, radius, spacing, type } from '@/theme';

/** The four tabs, in order: picture + plain Hindi word each. Settings is not a tab (gear on घर). */
export const TABS: Record<string, { label: string; icon: IconName; id: string }> = {
  index: { label: 'घर', icon: 'house', id: 'tab-home' },
  notra: { label: 'नोतरा', icon: 'events', id: 'tab-notra' },
  rishte: { label: 'रिश्ते', icon: 'rings', id: 'tab-rishte' },
  inaam: { label: 'इनाम', icon: 'trophy', id: 'tab-inaam' },
};

/** Bottom bar: icon above a Hindi word; the open tab gets a soft haldi pill and indigo tint. Meaning is never colour alone. */
export function BottomTabs({ state, navigation, descriptors }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;
  const bannerScreen = focusedName === 'index' ? 'home' : null; // the banner shows on घर only
  return (
    <View>
      {bannerScreen ? <AdBanner screen={bannerScreen} /> : null}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const t = TABS[route.name];
          if (!t || (descriptors[route.key]?.options as { href?: unknown } | undefined)?.href === null) return null; // hidden by a feature flag
          const focused = state.index === i;
          const ink = focused ? colors.received : colors.muted;
          return (
            <PressableScale
              key={route.key}
              testID={t.id}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name as never);
              }}
              outerStyle={styles.tabOuter}
              style={styles.tab}
            >
              <View style={[styles.pill, focused && styles.pillOn]}>
                <Icon name={t.icon} size={24} color={ink} strokeWidth={focused ? 2.5 : 2} />
              </View>
              <Text style={[focused ? type.captionBold : type.caption, styles.label, { color: ink }]} numberOfLines={1} importantForAccessibility="no">
                {t.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: BORDER, borderTopColor: colors.hairline, paddingTop: spacing.xs, paddingHorizontal: spacing.xs },
  tabOuter: { flex: 1 },
  tab: { minHeight: 60, alignItems: 'center', justifyContent: 'flex-start', gap: 2, paddingVertical: spacing.xs },
  pill: { width: 52, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.haldiTint },
  label: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
