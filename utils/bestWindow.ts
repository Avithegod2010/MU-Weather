import { t } from './i18n';
import { formatHourLabel } from './format';

export interface BestWindow {
  /** Local wall-clock ISO of the window's first hour. */
  start: string;
  /** Local wall-clock ISO of the window's last hour. */
  end: string;
  /** 0-100 comfort score for the window. */
  score: number;
}

/** Localized one-liner for the card, e.g. "2 PM – 4 PM looks best today". */
export function bestWindowLine(window: BestWindow): string {
  const range = `${formatHourLabel(window.start, false)} – ${formatHourLabel(window.end, false)}`;
  return t('best_window_line').replace('{time}', range);
}
