/**
 * Font family constants. Outfit weights are registered as separate families
 * (expo-font registers each key as its own family name), so pick the family
 * that matches the intended weight and DO NOT combine with fontWeight
 * (that would trigger synthetic double-bolding).
 */
export const F = {
  light: 'Outfit_300Light',
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

