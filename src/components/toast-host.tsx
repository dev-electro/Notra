import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { toasts, type ToastState } from '@/services/toast';
import { colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

/** Shows the current toast just above the bottom button. Rendered once in the root layout. */
export function ToastHost() {
  const [t, setT] = useState<ToastState | null>(toasts.get());
  useEffect(() => toasts.subscribe(setT), []);
  if (!t) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.box} accessibilityLiveRegion="polite">
        <Text style={[type.bodyBold, styles.text]}>{t.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: MIN_TOUCH + spacing.xl * 2, alignItems: 'center', paddingHorizontal: spacing.md },
  box: { backgroundColor: colors.ink, borderRadius: radius.card, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  text: { color: colors.card, textAlign: 'center' },
});
