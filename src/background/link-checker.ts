const TIMEOUT_MS = 10_000;

export interface LinkCheckResult {
  url: string;
  status?: number;
  redirectedTo?: string;
  error?: string;
}

async function probe(url: string): Promise<LinkCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    return {
      url,
      status: response.status,
      redirectedTo: response.redirected && response.url !== url ? response.url : undefined,
    };
  } catch (error) {
    return {
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs `concurrency` probes at a time and reports after each completion, so the
 * popup can show "checked N of M" instead of freezing on a 1000-link page.
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

      const result = await probe(unique[index]);
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
