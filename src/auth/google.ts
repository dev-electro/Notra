import Constants from 'expo-constants';

/**
 * Google sign-in. The native module is imported only when the button is tapped, so it costs nothing at startup
 * (and Expo Go, which lacks the native module, still runs the rest of the app).
 * Returns the Google ID token, or null if the person cancelled.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  const webClientId = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId;
  GoogleSignin.configure({ webClientId, scopes: ['profile', 'email'] });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (res.type !== 'success') return null;
  return res.data.idToken;
}
