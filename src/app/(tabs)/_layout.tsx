import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { BottomTabs } from '@/components/bottom-tabs';
import { colors } from '@/theme';

/** घर · मेरा नोतरा · दूसरों का नोतरा · हिसाब · इनाम (placeholder for the super-app modules). The calendar lives on घर. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabs {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="mera" />
      <Tabs.Screen name="doosre" />
      <Tabs.Screen name="hisab" />
      <Tabs.Screen name="inaam" />
    </Tabs>
  );
}
