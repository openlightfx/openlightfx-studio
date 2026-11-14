import { test } from '@playwright/test';
import { runLabScenario } from '../lab/scenario';

test('LAB-SCENARIO declarative room, track and independent expectations', async ({
  page,
  request,
}, testInfo) => {
  await runLabScenario(page, request, testInfo);
});
