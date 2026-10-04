/**
 * The deep-dive screens a tile row can open. Kept as a runtime array (not just
 * a type) because the home-screen deep links validate against it and the
 * widget task builds its intent URIs from it - one list, no drift.
 */
export const TOPIC_KEYS = [
  'wind',
  'aqi',
  'uv',
  'humidity',
  'visibility',
  'pressure',
  'precipitation',
  'moon',
  'pollen',
  'graphs',
] as const;

export type TopicKey = (typeof TOPIC_KEYS)[number];

export interface DetailTileOption {
  key: string;
  label: string;
}

/** Toggleable detail cards - order matches the home grid. */
export const DETAIL_TILES: DetailTileOption[] = [
  { key: 'wind', label: 'Wind' },
  { key: 'aqi', label: 'Air Quality' },
  { key: 'uv', label: 'UV Index' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'precipitation', label: 'Precipitation' },
  { key: 'rainToday', label: "Today's Rain" },
  { key: 'moon', label: 'Moon' },
  { key: 'health', label: 'Health' },
  { key: 'pollen', label: 'Pollen' },
  { key: 'snow', label: 'Snow' },
  { key: 'graphs', label: 'Graphs' },
  { key: 'sunTwilight', label: 'Sun & Twilight' },
  { key: 'journal', label: 'Comfort journal' },
  { key: 'yearReview', label: 'Year in review' },
];

export interface HideableTile {
  key: string;
  label: string;
}

export interface TileGroup {
  title: string;
  tiles: HideableTile[];
}

/** Everything the user can hide, grouped for the settings screen. */
export const TILE_GROUPS: TileGroup[] = [
  {
    title: 'Main sections',
    tiles: [
      { key: 'highlights', label: 'Highlights' },
      { key: 'nowcast', label: 'Nowcast' },
      { key: 'rainChart', label: 'Rain probability' },
      { key: 'hourly', label: 'Hourly forecast' },
      { key: 'daily', label: 'Daily forecast' },
      { key: 'trend', label: '48-hour trends' },
      { key: 'pastWeek', label: 'Past week' },
      { key: 'climate', label: 'Climate' },
      { key: 'onThisDay', label: 'On this day' },
      { key: 'models', label: 'Model comparison' },
      { key: 'warnings', label: 'Warnings' },
      { key: 'activity', label: 'Activity planner' },
      { key: 'tripPlanner', label: 'Trip planner' },
      { key: 'calendar', label: 'Calendar weather' },
      { key: 'marine', label: 'Marine forecast' },
      { key: 'bestWindow', label: 'Best time outdoors' },
      { key: 'records', label: 'Records' },
      { key: 'aurora', label: 'Aurora' },
    ],
  },
  {
    title: 'Detail cards',
    tiles: [...DETAIL_TILES],
  },
];
