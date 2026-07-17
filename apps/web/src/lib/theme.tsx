import { createContext, useContext } from 'react';

export type PublicTheme = 'classic' | 'modern';

export const PublicThemeContext = createContext<PublicTheme>('classic');

export function usePublicTheme(): PublicTheme {
  return useContext(PublicThemeContext);
}

export function normalizePublicTheme(value: unknown): PublicTheme {
  return String(value ?? '').toLowerCase() === 'modern' ? 'modern' : 'classic';
}
