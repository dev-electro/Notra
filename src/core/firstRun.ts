/** Where a launch should go before the home screen: onboarding, the optional sign-in, then my-household setup. */
export function firstRunRoute(s: { onboardingSeen: boolean; signinPrompted: boolean; setupDone: boolean }): string | null {
  if (!s.onboardingSeen) return '/onboarding';
  if (!s.signinPrompted) return '/signin?first=1';
  if (!s.setupDone) return '/setup';
  return null;
}
