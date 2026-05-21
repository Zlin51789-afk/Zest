/** 仅允许通过 chipgo.net / www.chipgo.net 访问（与 Cloudflare 隧道一致） */
export const ALLOWED_HOSTNAMES = new Set(['chipgo.net', 'www.chipgo.net']);

export function requestHostname(req) {
  const raw = String(req?.hostname || req?.headers?.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!raw) return '';
  return raw.replace(/:\d+$/, '');
}

export function isAllowedHostname(host) {
  return ALLOWED_HOSTNAMES.has(String(host || '').toLowerCase());
}

function publicSiteUrl(req) {
  const proto =
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.PUBLIC_HTTPS === '1' ||
    process.env.VERCEL === '1'
      ? 'https'
      : 'http';
  const host = requestHostname(req);
  const useHost = isAllowedHostname(host) ? host : 'chipgo.net';
  return `${proto}://${useHost}`;
}

/**
 * 非允许域名：页面 302 到 chipgo.net；API 返回 403 JSON。
 * 设置 ALLOW_ALL_HOSTS=1 可跳过（仅本地调试）。
 */
export function enforceAllowedHosts(req, res, next) {
  if (process.env.ALLOW_ALL_HOSTS === '1') return next();

  const host = requestHostname(req);
  if (!host || isAllowedHostname(host)) return next();

  if (req.path.startsWith('/api')) {
    return res.status(403).json({
      error: 'HOST_NOT_ALLOWED',
      message: '请使用 https://chipgo.net 或 https://www.chipgo.net 访问',
    });
  }

  const target = `${publicSiteUrl(req)}${req.originalUrl || req.url || '/'}`;
  return res.redirect(302, target);
}
