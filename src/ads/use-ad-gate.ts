import { useEffect, useSyncExternalStore } from 'react';
import { useRemote } from '@/remote/use-remote';
import type { AdPlacement, AdScreen } from './policy';
import { initAds, liveDecision } from './service';
import { getAdsState, subscribeAds } from './state';

/**
 * Should this placement render an ad right now? Re-evaluates when the remote config or the SDK state changes. When everything but
 * "SDK ready" says yes, it wakes the SDK (lazy init + consent). The answer is false until an ad can actually be requested, so
 * a screen reserves no space and never jumps.
 */
export function useAdGate(placement: AdPlacement, screen: AdScreen, more: { itemCount?: number; index?: number } = {}): boolean {
  const ads = useSyncExternalStore(subscribeAds, getAdsState, getAdsState);
  useRemote(); // re-render when the config changes (liveDecision reads the live config)
  const wouldShow = ads.armed && liveDecision(placement, screen, { ...more, assumeReady: true }).show;
  useEffect(() => {
    if (wouldShow && !ads.ready) void initAds();
  }, [wouldShow, ads.ready]);
  return ads.armed && liveDecision(placement, screen, more).show;
}
