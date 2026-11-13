/** Serve the static SPA under the plugin prefixes without copying the build. */
const PREFIXES = ['/emby/OpenLightFX/studio', '/OpenLightFX/studio'];

/** @param {string} url */
export function rewriteStudioPrefix(url) {
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  const search = query === -1 ? '' : url.slice(query);
  for (const prefix of PREFIXES) {
    if (path === prefix) return { redirect: `${prefix}/${search}` };
    if (path === `${prefix}/` || path.startsWith(`${prefix}/`)) {
      const rest = path.slice(prefix.length);
      return { url: `${rest === '/' ? '/' : rest}${search}` };
    }
  }
  return null;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {() => void} next
 */
export function studioPrefixMiddleware(req, res, next) {
  if (!req.url) return next();
  const rewritten = rewriteStudioPrefix(req.url);
  if (!rewritten) return next();
  if (rewritten.redirect) {
    res.statusCode = 308;
    res.setHeader('Location', rewritten.redirect);
    res.end();
    return;
  }
  req.url = rewritten.url;
  next();
}
