/** Node/test fallback. Metro selects the platform-specific implementation. */
export function traceSync<T>(_name: string, work: () => T): T {
  return work();
}

export async function traceAsync<T>(_name: string, work: () => Promise<T>): Promise<T> {
  return work();
}
