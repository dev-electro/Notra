/** Headers that tell the server which app and phone is calling. No identifiers: version, platform and OS version only. */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const PLAY_STORE_ID = 'app.notra.diary';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}`;

export function appVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
}

export function platformName(): 'android' | 'ios' | 'web' {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

export function appHeaders(): Record<string, string> {
  return { 'X-App-Version': appVersion(), 'X-Platform': platformName(), 'X-OS-Version': String(Platform.Version ?? '') };
}
