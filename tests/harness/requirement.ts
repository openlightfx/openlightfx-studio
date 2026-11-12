import { it } from 'vitest';
import { parseTitle, runExpected } from './gate';

/** Title must be a string literal so the traceability checker can see the id. */
export function requirement(title: string, fn: () => Promise<void> | void): void {
  const { id, tier } = parseTitle(title);
  it(title, () => runExpected(id, tier, title, fn));
}
