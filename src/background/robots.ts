import type { RobotsInfo } from '../shared/messages';

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: 'omit' });
  } finally {
    clearTimeout(timer);
  }
}

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

export function parseRobotsTxt(text: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (!current) continue;
    lastWasAgent = false;
    if (field === 'disallow') current.disallow.push(value);
    else if (field === 'allow') current.allow.push(value);
  }

  return { groups, sitemaps };
}

/** Converts a robots.txt path pattern (supporting * and $) into a regex. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp(`^${escaped}`);
}

/**
 * Applies Google's matching rules: the most specific matching Allow/Disallow
 * wins, ties go to Allow. Returns the disallow rule that blocks the path, or
 * null when crawling is permitted.
 */
export function findBlockingRule(
  groups: RobotsGroup[],
  path: string,
  userAgent = 'googlebot',
): string | null {
  const specific = groups.filter((g) => g.agents.includes(userAgent));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const applicable = specific.length > 0 ? specific : wildcard;
  if (applicable.length === 0) return null;

  let bestDisallow: string | null = null;
  let bestDisallowLength = -1;
  let bestAllowLength = -1;

  for (const group of applicable) {
    for (const rule of group.disallow) {
      if (rule === '') continue; // "Disallow:" with an empty value allows everything.
      if (patternToRegex(rule).test(path) && rule.length > bestDisallowLength) {
        bestDisallow = rule;
        bestDisallowLength = rule.length;
      }
    }
    for (const rule of group.allow) {
      if (rule === '') continue;
      if (patternToRegex(rule).test(path) && rule.length > bestAllowLength) {
        bestAllowLength = rule.length;
      }
    }
  }

  if (bestDisallow === null) return null;
  return bestAllowLength >= bestDisallowLength ? null : `Disallow: ${bestDisallow}`;
}

export async function checkRobots(origin: string, pageUrl: string): Promise<RobotsInfo> {
  const robotsTxtUrl = `${origin.replace(/\/+$/, '')}/robots.txt`;
  const info: RobotsInfo = {
    robotsTxtFound: false,
    robotsTxtUrl,
    blockedBy: [],
    sitemapUrls: [],
    sitemapReachable: null,
    xRobotsTag: null,
    httpStatus: null,
    redirectChain: [],
  };

  let path = '/';
  try {
    const url = new URL(pageUrl);
    path = url.pathname + url.search;
  } catch {
    /* keep the default */
  }

  // 1. Headers + redirect chain of the audited URL itself.
  try {
    const response = await fetchWithTimeout(pageUrl, { method: 'GET', redirect: 'follow' });
    info.httpStatus = response.status;
    info.xRobotsTag = response.headers.get('x-robots-tag');
    if (response.url && response.url !== pageUrl) {
      info.redirectChain = [pageUrl, response.url];
    } else {
      info.redirectChain = [pageUrl];
    }
    // Body is not needed; releasing it keeps the connection from hanging open.
    void response.body?.cancel();
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }

  // 2. robots.txt.
  try {
    const response = await fetchWithTimeout(robotsTxtUrl);
    if (response.ok) {
      const text = await response.text();
      info.robotsTxtFound = true;
      const { groups, sitemaps } = parseRobotsTxt(text);
      info.sitemapUrls = sitemaps;
      const blocking = findBlockingRule(groups, path);
      if (blocking) info.blockedBy.push(blocking);
    }
  } catch {
    /* robotsTxtFound stays false */
  }

  // 3. sitemap.xml — either the one declared in robots.txt or the default path.
  const sitemapCandidate = info.sitemapUrls[0] ?? `${origin.replace(/\/+$/, '')}/sitemap.xml`;
  try {
    const response = await fetchWithTimeout(sitemapCandidate, { method: 'GET' });
    info.sitemapReachable = response.ok;
    if (response.ok && info.sitemapUrls.length === 0) info.sitemapUrls.push(sitemapCandidate);
    void response.body?.cancel();
  } catch {
    info.sitemapReachable = false;
  }

  return info;
}
