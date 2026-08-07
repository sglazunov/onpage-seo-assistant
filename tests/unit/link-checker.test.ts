import { describe, expect, it } from 'vitest';
import { checkLinks, classifyStatus } from '../../src/background/link-checker';
import { runAudit } from '../../src/core/analyzers/audit';
import { makeLink, makePage } from '../fixtures/page';

describe('classifyStatus', () => {
  it('maps every HTTP range to an outcome', () => {
    expect(classifyStatus(200, false)).toBe('ok');
    expect(classifyStatus(200, true)).toBe('redirect');
    expect(classifyStatus(301, false)).toBe('redirect');
    expect(classifyStatus(404, false)).toBe('client-error');
    expect(classifyStatus(503, false)).toBe('server-error');
    expect(classifyStatus(0, false)).toBe('unknown');
  });
});

describe('checkLinks', () => {
  it('reports progress and never rejects when a probe throws', async () => {
    const original = globalThis.fetch;
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      if (call % 2 === 0) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      const seen: number[] = [];
      const results = await checkLinks(
        ['https://a.test/1', 'https://a.test/2', 'https://a.test/3'],
        2,
        (done) => seen.push(done),
      );
      expect(results).toHaveLength(3);
      expect(seen.at(-1)).toBe(3);
      // Failures are recorded as an outcome, not thrown away or rethrown.
      expect(results.every((r) => typeof r.outcome === 'string')).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('deduplicates identical URLs', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    try {
      const results = await checkLinks(
        ['https://a.test/x', 'https://a.test/x', 'https://a.test/x'],
        4,
        () => undefined,
      );
      expect(results).toHaveLength(1);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('inconclusive checks never mark a link broken', () => {
  it.each(['cors', 'timeout', 'network', 'unknown'] as const)(
    '%s does not raise LINK-010',
    (outcome) => {
      const result = runAudit(
        makePage({
          links: [makeLink({ checkResult: outcome, checkError: 'Failed to fetch', status: undefined })],
        }),
        { now: 0 },
      );
      expect(result.issues.map((i) => i.id)).not.toContain('LINK-010');
    },
  );

  it('a real 404 does raise LINK-010 as an error', () => {
    const result = runAudit(
      makePage({ links: [makeLink({ status: 404, checkResult: 'client-error' })] }),
      { now: 0 },
    );
    const issue = result.issues.find((i) => i.id === 'LINK-010');
    expect(issue?.severity).toBe('error');
  });
});
