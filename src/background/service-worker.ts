import type { ExtensionMessage, MessageResponse } from '../shared/messages';
import { isRestrictedUrl } from '../shared/constants';
import { addHistoryEntry, getSettings, setSettings } from '../shared/storage';
import { checkLinks } from './link-checker';
import { checkRobots } from './robots';

/**
 * MV3 service worker. It owns anything the popup cannot do itself: injecting
 * the content script, cross-origin fetches, and persistence that must survive
 * the popup being closed.
 */

const CONTENT_SCRIPT_FILE = 'content.js';

async function isContentScriptAlive(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return Boolean(response);
  } catch {
    return false;
  }
}

/**
 * Injects the content script if it is not already running. activeTab grants us
 * access only after the user invoked the action, which is exactly when the
 * popup asks for this.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  if (await isContentScriptAlive(tabId)) return;
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: [CONTENT_SCRIPT_FILE],
  });
  // executeScript resolves before the listener registration settles on slow pages.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await isContentScriptAlive(tabId)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Content script did not respond after injection');
}

async function resolveTabId(explicit?: number): Promise<number> {
  if (typeof explicit === 'number') return explicit;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return tab.id;
}

function notifyPopup(payload: unknown): void {
  // The popup may already be closed; a rejected sendMessage is expected here.
  chrome.runtime.sendMessage(payload).catch(() => undefined);
}

async function handle(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.type) {
    case 'PING':
      return { ok: true, data: 'pong' };

    case 'GET_PAGE_DATA': {
      const tabId = await resolveTabId();
      const tab = await chrome.tabs.get(tabId);
      if (isRestrictedUrl(tab.url)) {
        return { ok: false, error: 'Restricted page', code: 'RESTRICTED' };
      }
      try {
        await ensureContentScript(tabId);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: 'NO_CONTENT_SCRIPT',
        };
      }
      const data = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_DATA' });
      return data as MessageResponse;
    }

    case 'HIGHLIGHT':
    case 'SCROLL_TO':
    case 'CLEAR_HIGHLIGHTS': {
      const tabId = await resolveTabId();
      await ensureContentScript(tabId);
      const data = await chrome.tabs.sendMessage(tabId, message);
      return data as MessageResponse;
    }

    case 'CHECK_LINKS': {
      const urls = message.links.map((l) => l.resolved);
      const results = await checkLinks(urls, message.concurrency, (done, total, batch) => {
        notifyPopup({ type: 'LINK_CHECK_PROGRESS', done, total, results: batch });
      });
      return { ok: true, data: results };
    }

    case 'CHECK_ROBOTS': {
      const info = await checkRobots(message.origin, message.pageUrl);
      return { ok: true, data: info };
    }

    case 'SAVE_HISTORY':
      await addHistoryEntry(message.result);
      return { ok: true, data: null };

    case 'GET_SETTINGS':
      return { ok: true, data: await getSettings() };

    case 'SET_SETTINGS':
      await setSettings(message.settings);
      return { ok: true, data: null };

    default:
      return { ok: false, error: `Unknown message: ${(message as { type: string }).type}` };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Progress notifications are broadcast by this worker; ignore the echo.
  if (sender.id !== chrome.runtime.id) return false;
  if ((message as { type?: string }).type === 'LINK_CHECK_PROGRESS') return false;

  handle(message)
    .then(sendResponse)
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  // Keeps the message channel open for the async response.
  return true;
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await setSettings(await getSettings());
  }
});
