/** Random id that works on older iOS Safari (no reliance on crypto.randomUUID). */
export function uid(prefix = ''): string {
  let rand = '';
  try {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    rand = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
  return `${prefix}${Date.now().toString(36)}${rand.slice(0, 12)}`;
}

/** Deep copy for plain JSON data (structuredClone is not available on Safari 14). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
