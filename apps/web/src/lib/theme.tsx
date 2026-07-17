import { createContext, useContext } from 'react';

export type PublicTheme = 'classic' | 'modern';
export type ClassicPalette = 'rosin' | 'plum' | 'ocean' | 'sage' | 'midnight';

export interface PublicAppearance {
  theme: PublicTheme;
  classicPalette: ClassicPalette;
}

export const PublicThemeContext = createContext<PublicAppearance>({
  theme: 'classic',
  classicPalette: 'rosin',
});

export function usePublicTheme(): PublicTheme {
  return useContext(PublicThemeContext).theme;
}

export function usePublicAppearance(): PublicAppearance {
  return useContext(PublicThemeContext);
}

export function normalizePublicTheme(value: unknown): PublicTheme {
  return String(value ?? '').toLowerCase() === 'modern' ? 'modern' : 'classic';
}

export function normalizeClassicPalette(value: unknown): ClassicPalette {
  const normalized = String(value ?? '').toLowerCase();
  return ['rosin', 'plum', 'ocean', 'sage', 'midnight'].includes(normalized)
    ? normalized as ClassicPalette
    : 'rosin';
}
