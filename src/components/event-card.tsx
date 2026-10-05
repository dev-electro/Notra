import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card as Box } from '@/components/card';
import { BigButton } from '@/components/big-button';
import { DirectionTag } from '@/components/direction';
import { OccasionBadge } from '@/components/occasion';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { displayDate, formatINR, LEGACY_EVENT_LABEL, occasionName, STATUS_LABEL } from '@/core';
import type { EventCard as Card } from '@/db';
import { colors, spacing, type } from '@/theme';

interface Props {
  card: Card;
  /** true: my own program (I receive). false: another family's program (I give). */
  mine: boolean;
  onOpen: (c: Card) => void;
  /** Label + handler of the big button under the card ("+ कौन आया"). */
  actionLabel?: string;
  onAction?: (c: Card) => void;
  actionTestID?: string;
}

/** A program as a card: picture, name (the custom name for "अन्य"), date, whose it is, how much, and one big action. */
export const EventCardView = React.memo(function EventCardView({ card: c, mine, onOpen, actionLabel, onAction, actionTestID }: Props) {
  const name = c.event.legacy ? LEGACY_EVENT_LABEL : occasionName(c.event.occasion, c.event.occasionLabel);
  const who = mine ? '' : [c.host.headName, c.host.fatherName && `${c.host.fatherName} का`, c.host.village].filter(Boolean).join(' · ');
  const amount = mine ? c.receivedPaise : c.givenPaise;
  return (
    <Box accent={mine ? 'received' : 'given'} style={styles.card}>
      <PressableScale
        testID="event-card"
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${who ? `${who}, ` : ''}${displayDate(c.event.date)}, ${STATUS_LABEL[c.event.status as keyof typeof STATUS_LABEL] ?? ''}`}
        accessibilityHint="नोतरे की पूरी जानकारी खोलें"
        onPress={() => onOpen(c)}
        style={styles.top}
      >
        <OccasionBadge occasion={c.event.occasion} />
        <View style={styles.flex}>
          <Text style={[type.heading, styles.title]} numberOfLines={2}>
            {mine ? name : c.host.headName}
          </Text>
          <Text style={[type.caption, styles.sub]} numberOfLines={2}>
            {mine ? '' : `${name} · `}
            {displayDate(c.event.date)} · {STATUS_LABEL[c.event.status as keyof typeof STATUS_LABEL] ?? ''}
          </Text>
          {!mine && who ? (
            <Text style={[type.caption, styles.sub]} numberOfLines={1}>
              {[c.host.fatherName && `${c.host.fatherName} का`, c.host.village].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {c.entryCount > 0 ? (
            <View style={styles.sum}>
              <DirectionTag direction={mine ? 'AAYA' : 'GAYA'} />
              <Text style={[type.money, { color: mine ? colors.received : colors.given }]}>{formatINR(amount)}</Text>
              {mine ? <Text style={[type.caption, styles.sub]}>· {c.giverCount} परिवार</Text> : null}
            </View>
          ) : null}
        </View>
      </PressableScale>
      {actionLabel && onAction ? <BigButton testID={actionTestID} icon={mine ? 'plus' : 'moneyOut'} label={actionLabel} onPress={() => onAction(c)} /> : null}
    </Box>
  );
});

const styles = StyleSheet.create({
  card: { gap: spacing.sm, paddingLeft: spacing.md + spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  title: { color: colors.ink },
  sub: { color: colors.muted },
  sum: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
});
