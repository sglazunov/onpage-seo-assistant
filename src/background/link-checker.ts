import type { LinkCheckOutcome } from '../shared/types';

const TIMEOUT_MS = 10_000;

export interface LinkCheckResult {
  url: string;
  outcome: LinkCheckOutcome;
  status?: number;
  redirectedTo?: string;
  error?: string;
}

export function classifyStatus(status: number, redirected: boolean): LinkCheckOutcome {
  if (status >= 500) return 'server-error';
  if (status >= 400) return 'client-error';
  if (status >= 300) return 'redirect';
  if (status >= 200) return redirected ? 'redirect' : 'ok';
  return 'unknown';
}

/**
 * Tells a CORS refusal apart from a genuine network failure. A `no-cors`
 * request still reaches the server and yields an opaque response, so if the
 * retry succeeds the host is up and only the CORS policy blocked us. Neither
 * case proves the link is broken, which is why both stay out of LINK-010.
 */
async function disambiguateFailure(url: string, signal: AbortSignal): Promise<LinkCheckOutcome> {
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', credentials: 'omit', signal });
    return 'cors';
  } catch {
    return 'network';
  }
}

async function probe(url: string): Promise<LinkCheckResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
    // Plenty of servers reject HEAD outright; retry those with a GET.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit',
        signal: controller.signal,
      });
      void response.body?.cancel();
    }
    const redirected = response.redirected && response.url !== url;
    return {
      url,
      status: response.status,
      outcome: classifyStatus(response.status, redirected),
      redirectedTo: redirected ? response.url : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (timedOut) return { url, outcome: 'timeout', error: message };
    const outcome = await disambiguateFailure(url, controller.signal).catch(
      () => 'unknown' as const,
    );
    return { url, outcome, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs `concurrency` probes at a time and reports after each completion, so the
 * popup can show "checked N of M" instead of freezing on a 1000-link page.
 * A failing probe never aborts the run: every rejection is caught inside probe().
 */
export async function checkLinks(
  urls: string[],
  concurrency: number,
  onProgress: (done: number, total: number, batch: LinkCheckResult[]) => void,
): Promise<LinkCheckResult[]> {
  const unique = [...new Set(urls)];
  const total = unique.length;
  const results: LinkCheckResult[] = [];
  let cursor = 0;
  let done = 0;
  let pending: LinkCheckResult[] = [];
  let lastReport = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, 10)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;

      const result = await probe(unique[index]).catch(
        (error: unknown): LinkCheckResult => ({
          url: unique[index],
          outcome: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      results.push(result);
      pending.push(result);
      done += 1;

      // Batch the progress messages: one per result would flood the popup.
      const now = Date.now();
      if (done === total || now - lastReport > 250) {
        lastReport = now;
        onProgress(done, total, pending);
        pending = [];
      }
    }
  });

  await Promise.all(workers);
  if (pending.length) onProgress(done, total, pending);
  return results;
}
