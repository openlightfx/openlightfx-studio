import { test } from '@playwright/test';
import { isExpectedFailure, parseTitle, recordOutcome } from '../../tests/harness/gate';
import { forwardStudioFixtures, type StudioFixtures } from './fixtures';

/**
 * Title must be a string literal: `ID @tier description`.
 * Listed tiers use test.fail so a missing feature stays green and a new pass fails the run.
 */
export function requirement(title: string, fn: (args: StudioFixtures) => Promise<void>): void {
  const { id, tier } = parseTitle(title);
  const listed = isExpectedFailure(id, tier);
  const run = listed ? test.fail : test;
  run(title, async ({ page, request, browserName }) => {
    try {
      await forwardStudioFixtures({ page, request, browserName }, fn);
      recordOutcome({ id, tier, title, status: 'passed' });
    } catch (error) {
      recordOutcome({
        id,
        tier,
        title,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}
