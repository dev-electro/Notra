import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RuledPaper } from '@/components/ruled-paper';
import { back } from '@/nav';
import { colors, MIN_TOUCH, spacing, type } from '@/theme';

interface Props {
  title: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView. Screens with their own FlatList pass false. */
  scroll?: boolean;
  noBack?: boolean;
  onBack?: () => void;
}

/** Ruled-paper page with a big back arrow and Hindi title. */
export function Screen({ title, children, scroll = true, noBack, onBack }: Props) {
  return (
    <RuledPaper>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          {noBack ? null : (
            <Pressable accessibilityRole="button" accessibilityLabel="पीछे" onPress={onBack ?? back} style={styles.back}>
              <Text style={styles.backText}>←</Text>
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{children}</View>
        )}
      </SafeAreaView>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH, paddingLeft: 44, paddingRight: spacing.md },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, justifyContent: 'center', alignItems: 'center', marginLeft: -spacing.sm },
  backText: { fontSize: 36, color: colors.inkBlue },
  title: { ...type.title, color: colors.inkBlue, flexShrink: 1 },
  content: { padding: spacing.md, paddingLeft: 44, gap: spacing.md, paddingBottom: spacing.xl * 2 },
});
