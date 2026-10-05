import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { toasts, type ToastState } from '@/services/toast';
import { colors, spacing } from '@/theme';

/** Shows the current toast near the bottom of the screen. Rendered once in the root layout. */
export function ToastHost() {
  const [t, setT] = useState<ToastState | null>(toasts.get());
  useEffect(() => toasts.subscribe(setT), []);
  if (!t) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.box} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{t.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 48, alignItems: 'center', paddingHorizontal: spacing.md },
  box: { backgroundColor: colors.text, borderRadius: 14, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  text: { color: colors.card, fontSize: 20, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
});
