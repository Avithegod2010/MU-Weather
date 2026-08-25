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

/** Map a numeric fontWeight to its Outfit family. */
export function outfitForWeight(weight: '300' | '400' | '500' | '600' | '700' | string): string {
  switch (String(weight)) {
    case '300':
      return F.light;
    case '500':
      return F.medium;
    case '600':
      return F.semibold;
    case '700':
    case 'bold':
      return F.bold;
    default:
      return F.regular;
  }
}
