import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors } from '@/theme';

/** Gentle confirmation: a mehendi-green disc with a check mark that eases in (skipped when "remove animations" is on). */
export const SaveCheck = React.memo(function SaveCheck({ size = 96 }: { size?: number }) {
  const v = useRef(new Animated.Value(isReduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReduceMotion()) return;
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View style={styles.wrap} accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[styles.disc, { width: size, height: size, borderRadius: size / 2, opacity: v, transform: [{ scale }] }]}
      >
        <Icon name="check" size={size * 0.55} color={colors.onSolid} strokeWidth={3} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  disc: { backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
});
