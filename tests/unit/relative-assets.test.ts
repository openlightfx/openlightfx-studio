import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { relativizeSpaHtml } from '../../scripts/relativize-html.mjs';
import { rewriteStudioPrefix } from '../../scripts/studio-prefix.mjs';
import { requirement } from '../harness/requirement';

requirement('SHELL-001 @unit asset URLs are relative to the hosting directory', () => {
  const sample = `<link rel="icon" href="/logo.svg" />
    <link href="/_app/immutable/entry/start.js" rel="modulepreload">
    <script>
      {
        __sveltekit_test = {
          base: ""
        };
        import("/_app/immutable/entry/start.js");
      }
    </script>`;
  const rewritten = relativizeSpaHtml(sample);
  expect(rewritten).not.toMatch(/["']\/_app\//);
  expect(rewritten).toContain('"./_app/immutable/entry/start.js"');
  expect(rewritten).toContain('href="./logo.svg"');
  expect(rewritten).toContain('base: new URL(".", location).pathname.slice(0, -1)');

  expect(rewriteStudioPrefix('/emby/OpenLightFX/studio?api_key=test-admin')).toEqual({
    redirect: '/emby/OpenLightFX/studio/?api_key=test-admin',
  });
  expect(rewriteStudioPrefix('/emby/OpenLightFX/studio/?api_key=test-admin')).toEqual({
    url: '/?api_key=test-admin',
  });
  expect(rewriteStudioPrefix('/emby/OpenLightFX/studio/_app/immutable/entry/start.js')).toEqual({
    url: '/_app/immutable/entry/start.js',
  });

  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.VITEST;
  delete env.VITEST_POOL_ID;
  execSync('npm run build', { stdio: 'inherit', cwd: process.cwd(), env });
  const html = fs.readFileSync(path.join(process.cwd(), 'build/index.html'), 'utf8');
  expect(html).not.toMatch(/["']\/_app\//);
  expect(html).toMatch(/["']\.\/_app\//);
  expect(html).toContain('new URL(".", location).pathname.slice(0, -1)');
  expect(html).not.toMatch(/href=["']\/logo\.svg["']/);
});
