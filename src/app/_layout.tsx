import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { startSync } from '@/sync/runtime';
import { colors } from '@/theme';

export default function RootLayout() {
  useEffect(() => startSync(), []);
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.paper } }} />
    </>
  );
}
