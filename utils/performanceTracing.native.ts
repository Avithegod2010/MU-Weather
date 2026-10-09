import { Platform, Systrace } from 'react-native';

function isAndroidTraceEnabled(): boolean {
  return (
    __DEV__ &&
    Platform.OS === 'android' &&
    typeof Systrace?.isEnabled === 'function' &&
    Systrace.isEnabled()
  );
}

/** Development-only spans for Android System Trace / Perfetto. */
export function traceSync<T>(name: string, work: () => T): T {
  if (!isAndroidTraceEnabled()) return work();
  Systrace.beginEvent(`MUWeather:${name}`);
  try {
    return work();
  } finally {
    Systrace.endEvent();
  }
}

/** Async spans include provider wait time and are closed even on rejection. */
export async function traceAsync<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!isAndroidTraceEnabled()) return work();
  const label = `MUWeather:${name}`;
  const cookie = Systrace.beginAsyncEvent(label);
  try {
    return await work();
  } finally {
    Systrace.endAsyncEvent(label, cookie);
  }
}
