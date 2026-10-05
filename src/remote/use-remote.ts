import { useSyncExternalStore } from 'react';
import { getRemote, subscribeRemote, type RemoteSnapshot } from './state';

export const useRemote = (): RemoteSnapshot => useSyncExternalStore(subscribeRemote, getRemote, getRemote);
export const useRemoteConfig = () => useRemote().config;
