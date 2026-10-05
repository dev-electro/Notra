import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

interface Props {
  name: string;
  photoUri?: string;
  size?: number;
}

/** Photo avatar; falls back to the first letter of the name. */
export const Avatar = React.memo(function Avatar({ name, photoUri, size = 56 }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photoUri) return <Image source={{ uri: photoUri }} style={[styles.img, box]} resizeMethod="resize" />;
  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.letter, { fontSize: size * 0.5 }]}>{name.trim().charAt(0) || '?'}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  img: { backgroundColor: colors.border },
  fallback: { backgroundColor: colors.rule, justifyContent: 'center', alignItems: 'center' },
  letter: { color: colors.inkBlue, fontWeight: '700' },
});
