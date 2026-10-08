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

/** Text on a card or chip: the card and chip surfaces only. The app ships no shadow here. */
function cardSurfacesOf(theme: AppTheme): Rgb[] {
  const sky = theme.gradient.map(toRgb);
  const cardParsed = parseColor(theme.cardBg);
  const card = cardParsed ? composite(cardParsed, sky[1]) : sky[1];
  const chipParsed = parseColor(theme.chipBg);
  const chip = chipParsed ? composite(chipParsed, card) : card;
  return [card, chip];
}

/**
 * Text drawn straight on the sky (location, temperature, condition, feels-like on Home). The
 * sky stops are the surfaces. These lines carry a text halo (CurrentWeather.heroTextShadow),
 * which this audit cannot measure, so their failures are reported separately, not hidden.
 */
function skySurfacesOf(theme: AppTheme): Rgb[] {
  return theme.gradient.map(toRgb);
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

type Kind = 'card' | 'sky';

interface Row {
  kind: Kind;
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
          for (const kind of ['card', 'sky'] as Kind[]) {
            const surfaces = kind === 'card' ? cardSurfacesOf(themed) : skySurfacesOf(themed);
            const before = beforeWorst(themed, surfaces);
            for (const tier of TIERS) {
              rows.push({
                kind,
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
}

function summary(list: Row[], key: 'before' | 'after') {
  const failing = list.filter((row) => row[key] < MIN_TEXT_CONTRAST);
  const worst = list.reduce((low, row) => (row[key] < low[key] ? row : low), list[0]);
  return { failing: failing.length, total: list.length, worst };
}

const fmt = (row: Row) =>
  `${row.kind} · ${row.base} · ${row.style} · bg=${row.background} · theme=${row.colorTheme} · ${row.tier}`;

const cardRows = rows.filter((row) => row.kind === 'card');
const skyRows = rows.filter((row) => row.kind === 'sky');

console.log(`Checked ${rows.length} text colour cases (minimum ${MIN_TEXT_CONTRAST}:1).`);
for (const [label, list] of [['Card and chip text (no shadow)', cardRows], ['Sky text (hero, halo not measured)', skyRows]] as const) {
  const before = summary(list, 'before');
  const after = summary(list, 'after');
  console.log(`\n${label}: ${list.length} cases`);
  console.log(`  Before: ${before.failing}/${before.total} below minimum; worst ${before.worst.before.toFixed(2)}:1.`);
  console.log(`  After:  ${after.failing}/${after.total} below minimum; worst ${after.worst.after.toFixed(2)}:1 at ${fmt(after.worst)}.`);
  for (const tier of TIERS) {
    const result = summary(list.filter((row) => row.tier === tier), 'after');
    console.log(`    ${tier}: worst after ${result.worst.after.toFixed(2)}:1 (${result.failing} failing)`);
  }
}

const cardFailing = summary(cardRows, 'after').failing;
const skyFailing = summary(skyRows, 'after').failing;
if (cardFailing > 0) {
  console.log('\nCARD TEXT FAILING (must be zero):');
  for (const row of cardRows.filter((item) => item.after < MIN_TEXT_CONTRAST).slice(0, 40)) {
    console.log(`  ${row.after.toFixed(2)}:1  ${fmt(row)}`);
  }
  process.exitCode = 1;
}
if (skyFailing > 0) {
  console.log(`\nSky text below minimum: ${skyFailing} cases. Covered only by the hero text halo, which is not measured here.`);
}
