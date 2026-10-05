import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { colors } from '@/theme';

interface Props {
  name: string;
  photoUri?: string;
  size?: number;
}

/** Photo avatar; falls back to the first letter of the name. */
export const Avatar = React.memo(function Avatar({ name, photoUri, size = 56 }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photoUri) return <Image source={{ uri: photoUri }} style={[styles.img, box]} resizeMethod="resize" accessibilityLabel={`${name} की फ़ोटो`} />;
  return (
    <View style={[styles.fallback, box]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.letter, { fontSize: size * 0.5 }]}>{name.trim().charAt(0) || '?'}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  img: { backgroundColor: colors.border },
  fallback: { backgroundColor: colors.rule, justifyContent: 'center', alignItems: 'center' },
  letter: { color: colors.inkBlue, fontWeight: '700' },
});
