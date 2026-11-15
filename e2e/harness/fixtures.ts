import type { APIRequestContext, Page, PlaywrightWorkerOptions } from '@playwright/test';

export interface StudioFixtures {
  page: Page;
  request: APIRequestContext;
  browserName: PlaywrightWorkerOptions['browserName'];
}

export function forwardStudioFixtures<T>(
  fixtures: StudioFixtures,
  callback: (args: StudioFixtures) => Promise<T>
): Promise<T> {
  return callback({
    page: fixtures.page,
    request: fixtures.request,
    browserName: fixtures.browserName,
  });
}
