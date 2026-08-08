import type { AuditResult, ExportFormat, LinkInfo, PageData, Settings } from './types';

/** Messages sent popup -> service worker, and service worker -> content script. */
export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'START_AUDIT'; tabId?: number }
  | { type: 'GET_PAGE_DATA' }
  | {
      type: 'HIGHLIGHT';
      selectors: string[];
      category: string;
      label?: string;
      /** Text/src the element had when the report was built — guards against a
       *  positional selector resolving to a different element after a re-render. */
      verify?: string;
    }
  | { type: 'CLEAR_HIGHLIGHTS' }
  | {
      type: 'SCROLL_TO';
      selector: string;
      category: string;
      label?: string;
      verify?: string;
    }
  | { type: 'CHECK_LINKS'; links: Pick<LinkInfo, 'resolved' | 'type'>[]; concurrency: number }
  | { type: 'CHECK_ROBOTS'; origin: string; pageUrl: string }
  | { type: 'FETCH_HEADERS'; url: string }
  | { type: 'EXPORT_REPORT'; format: ExportFormat; result: AuditResult }
  | { type: 'SAVE_HISTORY'; result: AuditResult }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: Settings };

export type MessageResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'NO_CONTENT_SCRIPT' | 'RESTRICTED' | 'NO_PERMISSION' };

export interface LinkCheckProgress {
  type: 'LINK_CHECK_PROGRESS';
  done: number;
  total: number;
  results: { url: string; status?: number; redirectedTo?: string; error?: string }[];
}

export interface RobotsInfo {
  robotsTxtFound: boolean;
  robotsTxtUrl: string;
  /** Disallow rules that match the audited path for user-agent * or Googlebot. */
  blockedBy: string[];
  sitemapUrls: string[];
  sitemapReachable: boolean | null;
  xRobotsTag: string | null;
  httpStatus: number | null;
  redirectChain: string[];
  error?: string;
}

export function ok<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

export function fail(error: string, code?: MessageResponse['ok'] extends true ? never : string) {
  return { ok: false as const, error, code: code as never };
}

export type { PageData };
