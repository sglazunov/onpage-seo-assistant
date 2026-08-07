import type { ExtensionMessage, MessageResponse, RobotsInfo } from '../shared/messages';
import type { LinkCheckResult } from '../background/link-checker';
import type { AuditResult, PageData, Settings } from '../shared/types';

/** Thin typed wrapper around chrome.runtime.sendMessage. */
async function send<T>(message: ExtensionMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T> | undefined;
  if (!response) throw new Error('No response from the background service worker');
  if (!response.ok) {
    const error = new Error(response.error) as Error & { code?: string };
    error.code = response.code;
    throw error;
  }
  return response.data;
}

export const api = {
  getPageData: () => send<PageData>({ type: 'GET_PAGE_DATA' }),
  highlight: (selectors: string[], category: string, label?: string) =>
    send<{ matched: number }>({ type: 'HIGHLIGHT', selectors, category, label }),
  scrollTo: (selector: string, category: string, label?: string) =>
    send<{ found: boolean }>({ type: 'SCROLL_TO', selector, category, label }),
  clearHighlights: () => send<null>({ type: 'CLEAR_HIGHLIGHTS' }),
  checkLinks: (links: { resolved: string; type: string }[], concurrency: number) =>
    send<LinkCheckResult[]>({
      type: 'CHECK_LINKS',
      links: links as never,
      concurrency,
    }),
  checkRobots: (origin: string, pageUrl: string) =>
    send<RobotsInfo>({ type: 'CHECK_ROBOTS', origin, pageUrl }),
  getSettings: () => send<Settings>({ type: 'GET_SETTINGS' }),
  setSettings: (settings: Settings) => send<null>({ type: 'SET_SETTINGS', settings }),
  saveHistory: (result: AuditResult) => send<null>({ type: 'SAVE_HISTORY', result }),
};

/**
 * Cross-origin fetches need host access. Chrome only grants it from a user
 * gesture, which is why this is called straight out of a click handler.
 */
export async function requestHostPermission(): Promise<boolean> {
  if (!chrome.permissions?.request) return true;
  try {
    const already = await chrome.permissions.contains({
      origins: ['http://*/*', 'https://*/*'],
    });
    if (already) return true;
    return await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads must originate from an extension page: a service worker cannot
 * create the blob URL that chrome.downloads needs.
 */
export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const revoke = () => setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename, saveAs: false }, revoke);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  revoke();
}
