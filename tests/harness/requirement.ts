import { it } from 'vitest';
import { parseTitle, runExpected } from './gate';

/** Keep requirement titles as string literals for consistent test reporting. */
export function requirement(title: string, fn: () => Promise<void> | void): void {
  const { id, tier } = parseTitle(title);
  it(title, () => runExpected(id, tier, title, fn));
}
