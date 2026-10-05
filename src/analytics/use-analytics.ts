import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { track } from './index';
import { screenFromSegments, type EventParams } from './events';

/** Root layout: one screen_view per navigation, with the route TEMPLATE ("/events/[id]"), never real ids or params. */
export function useScreenTracking(): void {
  const segments = useSegments();
  const last = useRef<string | null>(null);
  const key = segments.join('/');
  useEffect(() => {
    const screen = screenFromSegments(key === '' ? [] : key.split('/'));
    if (!screen || screen === last.current) return;
    last.current = screen;
    track('screen_view', { screen_name: screen as EventParams<'screen_view'>['screen_name'] });
  }, [key]);
}

/** A report screen: log report_viewed once when it opens. */
export function useReportViewed(report: EventParams<'report_viewed'>['report']): void {
  useEffect(() => {
    track('report_viewed', { report });
  }, [report]);
}
