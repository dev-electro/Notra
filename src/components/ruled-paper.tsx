import React from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import { colors, RULE_PITCH } from '@/theme';

/** Off-white page with ruled lines and a red margin, like the paper diary. */
export function RuledPaper({ children, style, ...rest }: ViewProps) {
  const { height } = useWindowDimensions();
  const lines = Math.ceil(height / RULE_PITCH);
  return (
    <View style={[styles.page, style]} {...rest}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: lines }, (_, i) => (
          <View key={i} style={[styles.rule, { top: (i + 1) * RULE_PITCH }]} />
        ))}
        <View style={styles.margin} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  rule: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.rule },
  margin: { position: 'absolute', top: 0, bottom: 0, left: 28, width: 2, backgroundColor: colors.margin },
});
