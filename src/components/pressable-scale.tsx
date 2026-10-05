import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { PRESS_MS } from '@/theme';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  /** Layout of the touch area (flex, width, margins). */
  outerStyle?: StyleProp<ViewStyle>;
  /** Looks of the thing that scales (background, border, padding, radius). */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Pressable with a quick (150 ms) scale + fade on press, on the native driver (no JS work per frame). With "remove
 * animations" on, the pressed look appears instantly instead of animating.
 */
export const PressableScale = React.memo(function PressableScale({ outerStyle, style, children, onPressIn, onPressOut, ...rest }: Props) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const go = useCallback(
    (to: number) => {
      if (reduce) v.setValue(to);
      else Animated.timing(v, { toValue: to, duration: PRESS_MS, useNativeDriver: true }).start();
    },
    [reduce, v],
  );
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
  return (
    <Pressable
      {...rest}
      style={outerStyle}
      onPressIn={(e) => {
        go(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        go(0);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[styles.fill, style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({ fill: { flexGrow: 1 } });
