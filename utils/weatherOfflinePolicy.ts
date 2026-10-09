/** Small state transition shared by the weather loader and its offline tests. */
export type WeatherOfflineEvent = 'success' | 'network-failure' | 'other-failure';

/** A network failure sets the offline flag; any later outcome clears it. */
export function transitionWeatherOffline(
  previousOffline: boolean,
  event: WeatherOfflineEvent,
): boolean {
  switch (event) {
    case 'network-failure':
      return true;
    case 'success':
    case 'other-failure':
      return false;
    default:
      return previousOffline;
  }
}
