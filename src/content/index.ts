import type { ExtensionMessage, MessageResponse } from '../shared/messages';
import { collectPageData, installErrorRecorder } from './collector';
import { clearHighlights, highlight, scrollTo } from './highlighter';

/**
 * Content script entry point. It is injected on demand with
 * chrome.scripting.executeScript, which can happen more than once per tab, so
 * the whole thing guards against double registration.
 */
declare global {
  interface Window {
    __onpageSeoAssistantReady__?: boolean;
  }
}

if (!window.__onpageSeoAssistantReady__) {
  window.__onpageSeoAssistantReady__ = true;
  installErrorRecorder();

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse: (r: MessageResponse) => void) => {
      try {
        switch (message.type) {
          case 'PING':
            sendResponse({ ok: true, data: 'pong' });
            return false;

          case 'GET_PAGE_DATA':
            sendResponse({ ok: true, data: collectPageData() });
            return false;

          case 'HIGHLIGHT': {
            const matched = highlight({
              selectors: message.selectors,
              category: message.category,
              label: message.label,
              verify: message.verify,
            });
            sendResponse({ ok: true, data: { matched } });
            return false;
          }

          case 'SCROLL_TO': {
            const found = scrollTo(
              message.selector,
              message.category,
              message.label,
              message.verify,
            );
            sendResponse({ ok: true, data: { found } });
            return false;
          }

          case 'CLEAR_HIGHLIGHTS':
            clearHighlights();
            sendResponse({ ok: true, data: null });
            return false;

          default:
            return false;
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
  );
}
