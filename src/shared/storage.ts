import { DEFAULT_SETTINGS, DEFAULT_THRESHOLDS, STORAGE_KEYS } from './constants';
import type { AuditResult, HistoryEntry, Settings } from './types';

/**
 * All persistence goes through chrome.storage.local. MV3 service workers are
 * torn down between events, so nothing may be cached in module scope.
 */

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const raw = stored[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    thresholds: { ...DEFAULT_THRESHOLDS, ...raw?.thresholds },
    mutedRules: raw?.mutedRules ?? [],
  };
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const list = stored[STORAGE_KEYS.history];
  return Array.isArray(list) ? (list as HistoryEntry[]) : [];
}

export async function addHistoryEntry(result: AuditResult): Promise<void> {
  const settings = await getSettings();
  if (!settings.saveHistory) return;

  const entry: HistoryEntry = {
    id: `${result.analyzedAt}-${result.finalUrl}`,
    url: result.finalUrl,
    pageTitle: result.pageTitle,
    analyzedAt: result.analyzedAt,
    score: result.score.overall,
    errors: result.score.errors,
    warnings: result.score.warnings,
    infos: result.score.infos,
  };

  const history = await getHistory();
  // One entry per URL: a re-audit replaces the previous run rather than piling up.
  const deduped = history.filter((h) => h.url !== entry.url);
  deduped.unshift(entry);
  await chrome.storage.local.set({
    [STORAGE_KEYS.history]: deduped.slice(0, Math.max(1, settings.historyLimit)),
  });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
}

export async function removeHistoryEntry(id: string): Promise<void> {
  const history = await getHistory();
  await chrome.storage.local.set({
    [STORAGE_KEYS.history]: history.filter((h) => h.id !== id),
  });
}
