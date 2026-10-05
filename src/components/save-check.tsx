import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors } from '@/theme';

/** Gentle confirmation: a mehendi-green disc with a check mark that eases in (skipped when "remove animations" is on). */
export const SaveCheck = React.memo(function SaveCheck({ size = 96 }: { size?: number }) {
  const v = useRef(new Animated.Value(isReduceMotion() ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isReduceMotion()) return;
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [v, pulse]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  // One soft ring that grows and fades once after the check lands.
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] });
  return (
    <View style={styles.wrap} accessible={false} importantForAccessibility="no-hide-descendants">
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />
      <Animated.View
        style={[styles.disc, { width: size, height: size, borderRadius: size / 2, opacity: v, transform: [{ scale }] }]}
      >
        <Icon name="check" size={size * 0.55} color={colors.onSolid} strokeWidth={3} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', backgroundColor: colors.successTint },
  disc: { backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
});
