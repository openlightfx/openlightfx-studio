/**
 * adapter-static's SPA fallback is rendered with root-absolute /_app URLs.
 * paths.relative rewrites normal pages, but the fallback page keeps base ""
 * unless hash routing is on. Rewrite that document so the same build loads
 * under any prefix, including /emby/OpenLightFX/studio/.
 */
/** @param {string} html */
export function relativizeSpaHtml(html) {
  if (!html.includes('base:')) {
    throw new Error('SPA HTML has no SvelteKit base field');
  }
  let next = html.replace(/base:\s*""/, 'base: new URL(".", location).pathname.slice(0, -1)');
  next = next.replaceAll('"/_app/', '"./_app/');
  next = next.replaceAll("'/_app/", "'./_app/");
  next = next.replaceAll('"/logo.svg"', '"./logo.svg"');
  if (/["']\/_app\//.test(next)) {
    throw new Error('SPA HTML still references /_app from the site root');
  }
  if (/href=["']\/logo\.svg["']/.test(next)) {
    throw new Error('SPA HTML still references /logo.svg from the site root');
  }
  if (!next.includes('new URL(".", location).pathname.slice(0, -1)')) {
    throw new Error('SPA HTML base was not rewritten to the current directory');
  }
  return next;
}
