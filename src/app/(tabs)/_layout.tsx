import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { BottomTabs } from '@/components/bottom-tabs';
import { FEATURES } from '@/features';
import { colors } from '@/theme';

/** घर · नोतरा (मेरा | दूसरों का | हिसाब) · रिश्ते · इनाम. Exactly four tabs; settings is the gear on घर. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabs {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="notra" />
      <Tabs.Screen name="rishte" options={FEATURES.rishte ? undefined : ({ href: null } as object)} />
      <Tabs.Screen name="inaam" />
    </Tabs>
  );
}
