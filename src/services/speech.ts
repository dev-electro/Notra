/** Speak Hindi text aloud. expo-speech is loaded only when something is actually spoken. */
export async function speak(text: string): Promise<void> {
  try {
    const Speech = await import('expo-speech');
    Speech.stop();
    Speech.speak(text, { language: 'hi-IN', rate: 0.9 });
  } catch {
    /* speech is a convenience; never block saving */
  }
}
