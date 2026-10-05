import { router } from 'expo-router';

/** Untyped navigation helpers (typed routes are generated only at dev-server time). */
export const go = (path: string) => router.push(path as never);
export const replace = (path: string) => router.replace(path as never);
export const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));
