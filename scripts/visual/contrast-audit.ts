/**
 * Contrast audit for every theme combination the Home screen can produce.
 *
 *   10 weather bases (condition × day/night), × 2 style modes (material, glass),
 *   × 6 Home backgrounds, × 10 colour themes.
 *
 * Each final theme's text tiers are checked against every surface behind them: the three
 * sky stops, the card and the chip. "Before" uses the original design alphas on the same
 * surfaces; "after" uses the colours the theme now ships with.
 *
 * Build and run (see scripts/visual/README.md):
 *   npx tsc --outDir /tmp/contrast-build --module commonjs --target es2019 \
 *     --moduleResolution node --skipLibCheck --esModuleInterop scripts/visual/contrast-audit.ts
 *   node /tmp/contrast-build/scripts/visual/contrast-audit.js
 */
import { PALETTES, buildTheme, type AppTheme, type StyleMode, type WeatherCondition } from '../../theme/palettes';
import { BACKGROUND_OPTIONS, applyHomeBackground } from '../../config/backgrounds';
import { COLOR_THEMES, applyColorTheme } from '../../config/colorThemes';
import { MIN_TEXT_CONTRAST, composite, contrastRatio, toRgb, type Rgb } from '../../utils/contrast';
import { parseColor } from '../../utils/color';

const CONDITIONS = Object.keys(PALETTES) as WeatherCondition[];
const STYLES: StyleMode[] = ['material', 'glass'];
const TIERS = ['textPrimary', 'textSecondary', 'textTertiary'] as const;

function surfacesOf(theme: AppTheme): Rgb[] {
  const sky = theme.gradient.map(toRgb);
  const cardParsed = parseColor(theme.cardBg);
  const card = cardParsed ? composite(cardParsed, sky[1]) : sky[1];
  const chipParsed = parseColor(theme.chipBg);
  const chip = chipParsed ? composite(chipParsed, card) : card;
  return [...sky, card, chip];
}

/** Worst contrast of one text colour across all surfaces. */
function worstFor(color: string, surfaces: Rgb[]): number {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`unparsed text colour ${color}`);
  return Math.min(...surfaces.map((surface) => contrastRatio(composite(parsed, surface), surface)));
}

/** Before: the original design alphas, with the original ink for the theme's brightness. */
function beforeWorst(theme: AppTheme, surfaces: Rgb[]): Record<(typeof TIERS)[number], number> {
  const ink = theme.isLight ? '#1C2431' : '#FFFFFF';
  const inkParsed = parseColor(ink)!;
  const alpha = theme.isLight
    ? { textPrimary: 1, textSecondary: 0.68, textTertiary: 0.45 }
    : { textPrimary: 1, textSecondary: 0.74, textTertiary: 0.5 };
  const result = {} as Record<(typeof TIERS)[number], number>;
  for (const tier of TIERS) {
    result[tier] = worstFor(`rgba(${inkParsed.r},${inkParsed.g},${inkParsed.b},${alpha[tier]})`, surfaces);
  }
  return result;
}

interface Row {
  base: string;
  style: StyleMode;
  background: string;
  colorTheme: string;
  tier: (typeof TIERS)[number];
  before: number;
  after: number;
}

const rows: Row[] = [];
for (const condition of CONDITIONS) {
  for (const isDay of [true, false]) {
    for (const style of STYLES) {
      const palette = PALETTES[condition][isDay ? 'day' : 'night'];
      const base = buildTheme(palette, style);
      for (const background of BACKGROUND_OPTIONS) {
        for (const colorTheme of COLOR_THEMES) {
          const themed = applyColorTheme(applyHomeBackground(base, background.key, style), colorTheme.key, style, null);
          const surfaces = surfacesOf(themed);
          const before = beforeWorst(themed, surfaces);
          for (const tier of TIERS) {
            rows.push({
              base: `${condition}-${isDay ? 'day' : 'night'}`,
              style,
              background: background.key,
              colorTheme: colorTheme.key,
              tier,
              before: before[tier],
              after: worstFor(themed[tier], surfaces),
            });
          }
        }
      }
    }
  }
}

function summary(list: Row[], key: 'before' | 'after') {
  const failing = list.filter((row) => row[key] < MIN_TEXT_CONTRAST);
  const worst = list.reduce((low, row) => (row[key] < low[key] ? row : low), list[0]);
  return { failing: failing.length, total: list.length, worst };
}

const before = summary(rows, 'before');
const after = summary(rows, 'after');
const byTier = (tier: string) => summary(rows.filter((row) => row.tier === tier), 'after');

const fmt = (row: Row) =>
  `${row.base} · ${row.style} · bg=${row.background} · theme=${row.colorTheme} · ${row.tier}`;

console.log(`Checked ${rows.length} text colour cases (minimum ${MIN_TEXT_CONTRAST}:1).`);
console.log(`Before: ${before.failing}/${before.total} below minimum; worst ${before.worst.before.toFixed(2)}:1 at ${fmt(before.worst)}.`);
console.log(`After:  ${after.failing}/${after.total} below minimum; worst ${after.worst.after.toFixed(2)}:1 at ${fmt(after.worst)}.`);
for (const tier of TIERS) {
  const result = byTier(tier);
  console.log(`  ${tier}: worst after ${result.worst.after.toFixed(2)}:1 (${result.failing} failing)`);
}

if (after.failing > 0) {
  console.log('\nFAILING AFTER FIX:');
  for (const row of rows.filter((item) => item.after < MIN_TEXT_CONTRAST).slice(0, 40)) {
    console.log(`  ${row.after.toFixed(2)}:1  ${fmt(row)}`);
  }
  process.exitCode = 1;
}
