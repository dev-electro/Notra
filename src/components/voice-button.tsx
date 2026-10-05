import React from 'react';
import { BigButton } from '@/components/big-button';
import { useVoiceInput } from '@/services/voice-input';

interface Props {
  onTranscript: (text: string) => void;
}

/** Mic button. Renders nothing when speech recognition is unavailable (e.g. Expo Go). */
export function VoiceButton({ onTranscript }: Props) {
  const { available, listening, start, stop } = useVoiceInput(onTranscript);
  if (!available) return null;
  return (
    <BigButton
      icon="mic"
      label={listening ? 'सुन रहा हूँ… (रोकें)' : 'बोलकर लिखें'}
      tone="given"
      selected={listening}
      onPress={listening ? stop : start}
    />
  );
}
