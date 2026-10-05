/**
 * A tiny tick under the finger on save and on number-pad taps (confirms a press when the phone is noisy or the screen is
 * hard to see in sunlight). expo-haptics is loaded on first use and cached; every failure is swallowed, since a missing
 * vibrator must never block saving or typing.
 */
type Haptics = typeof import('expo-haptics');
let mod: Promise<Haptics> | null = null;
const load = () => (mod ??= import('expo-haptics'));

/** Load the module ahead of the first tap so the first key press is as quick as the rest. */
export function warmHaptics(): void {
  load().catch(() => undefined);
}

export function tapLight(): void {
  load()
    .then((H) => H.impactAsync(H.ImpactFeedbackStyle.Light))
    .catch(() => undefined);
}
