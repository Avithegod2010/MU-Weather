export type TopicKey =
  | 'wind'
  | 'aqi'
  | 'uv'
  | 'humidity'
  | 'visibility'
  | 'pressure'
  | 'precipitation'
  | 'moon'
  | 'pollen';

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
    ],
  },
  {
    title: 'Detail cards',
    tiles: [...DETAIL_TILES],
  },
];
