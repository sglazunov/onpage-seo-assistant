import { describe, expect, it } from 'vitest';
import { findBlockingRule, parseRobotsTxt } from '../../src/background/robots';

const ROBOTS = `
# comment
User-agent: *
Disallow: /admin/
Disallow: /search
Allow: /admin/public/

User-agent: Googlebot
Disallow: /no-google/

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/news-sitemap.xml
`;

describe('parseRobotsTxt', () => {
  it('collects groups and sitemaps', () => {
    const { groups, sitemaps } = parseRobotsTxt(ROBOTS);
    expect(groups).toHaveLength(2);
    expect(sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/news-sitemap.xml',
    ]);
  });

  it('merges consecutive user-agent lines into one group', () => {
    const { groups } = parseRobotsTxt('User-agent: a\nUser-agent: b\nDisallow: /x');
    expect(groups).toHaveLength(1);
    expect(groups[0].agents).toEqual(['a', 'b']);
  });
});

describe('findBlockingRule', () => {
  const { groups } = parseRobotsTxt(ROBOTS);

  it('prefers the agent-specific group over the wildcard one', () => {
    // Googlebot's own group has no /admin/ rule, so /admin/ is allowed for it.
    expect(findBlockingRule(groups, '/admin/secret', 'googlebot')).toBeNull();
    expect(findBlockingRule(groups, '/no-google/x', 'googlebot')).toBe('Disallow: /no-google/');
  });

  it('applies the wildcard group to other agents', () => {
    expect(findBlockingRule(groups, '/admin/secret', 'yandexbot')).toBe('Disallow: /admin/');
  });

  it('lets a longer Allow win over a shorter Disallow', () => {
    expect(findBlockingRule(groups, '/admin/public/page', 'yandexbot')).toBeNull();
  });

  it('allows anything not covered by a rule', () => {
    expect(findBlockingRule(groups, '/catalog/item', 'yandexbot')).toBeNull();
  });

  it('supports wildcards and the $ anchor', () => {
    const { groups: wild } = parseRobotsTxt('User-agent: *\nDisallow: /*.pdf$');
    expect(findBlockingRule(wild, '/files/report.pdf')).toBe('Disallow: /*.pdf$');
    expect(findBlockingRule(wild, '/files/report.pdf?x=1')).toBeNull();
  });

  it('treats an empty Disallow as "allow everything"', () => {
    const { groups: open } = parseRobotsTxt('User-agent: *\nDisallow:');
    expect(findBlockingRule(open, '/anything')).toBeNull();
  });
});
