import { getRandomBytes } from 'expo-crypto';
import { hashPin } from '@/core';

/** Salted PBKDF2 hash of a PIN with a fresh random salt (the PIN itself is never stored). */
export const newPinHash = (pin: string): string => hashPin(pin, getRandomBytes(16));
