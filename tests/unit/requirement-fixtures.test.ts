import { expect, it } from 'vitest';
import type { APIRequestContext, Page } from '@playwright/test';
import { forwardStudioFixtures, type StudioFixtures } from '../../e2e/harness/fixtures';

it('forwards chromium to the browser-specific branch and propagates its failure', async () => {
  const expectedFailure = new Error('Chromium frame budget exceeded');
  let chromiumBranchExecuted = false;
  const fixtures: StudioFixtures = {
    page: {} as Page,
    request: {} as APIRequestContext,
    browserName: 'chromium',
  };

  await expect(
    forwardStudioFixtures(fixtures, async ({ browserName }) => {
      if (browserName === 'chromium') {
        chromiumBranchExecuted = true;
        throw expectedFailure;
      }
    })
  ).rejects.toBe(expectedFailure);

  expect(chromiumBranchExecuted).toBe(true);
});
