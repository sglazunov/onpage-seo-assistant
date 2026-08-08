import { HIGHLIGHT_COLORS } from '../shared/constants';

/**
 * Draws overlay boxes over matched elements instead of restyling them, so the
 * page's own CSS is never modified. Everything lives inside a shadow root to
 * keep site styles from leaking in.
 */
const HOST_ID = '__onpage_seo_highlight_host__';
const MAX_BOXES = 300;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let tracked: { element: Element; box: HTMLDivElement; snapshot: string }[] = [];
let rafPending = false;
let listenersAttached = false;
let domObserver: MutationObserver | null = null;

function ensureHost(): ShadowRoot {
  if (shadow && host?.isConnected) return shadow;

  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483646',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .box {
      position: absolute;
      box-sizing: border-box;
      border: 2px solid var(--c, #dc2626);
      background: color-mix(in srgb, var(--c, #dc2626) 12%, transparent);
      border-radius: 2px;
      pointer-events: none;
      transition: opacity .12s ease;
    }
    .label {
      position: absolute;
      top: -18px;
      left: -2px;
      font: 600 11px/16px -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #fff;
      background: var(--c, #dc2626);
      padding: 0 5px;
      border-radius: 3px 3px 0 0;
      white-space: nowrap;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .box.pulse { animation: pulse 1s ease 2; }
    @keyframes pulse { 50% { opacity: .35; } }
  `;
  shadow.appendChild(style);
  document.documentElement.appendChild(host);
  attachListeners();
  return shadow;
}

function positionBox(box: HTMLDivElement, element: Element): void {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  box.style.left = `${rect.left + window.scrollX}px`;
  box.style.top = `${rect.top + window.scrollY}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

/**
 * Drops overlays that no longer mean what they meant when drawn: either the
 * element left the document, or a framework reused the node and swapped its
 * content. React does the latter on a route change — the <h1> stays, its text
 * changes — so an isConnected check alone would leave a box pointing at
 * something the report never described.
 */
function pruneDetached(): void {
  const survivors: typeof tracked = [];
  for (const entry of tracked) {
    const stillValid =
      entry.element.isConnected && contentSnapshot(entry.element) === entry.snapshot;
    if (stillValid) survivors.push(entry);
    else entry.box.remove();
  }
  tracked = survivors;
  if (tracked.length === 0) stopObserving();
}

function startObserving(): void {
  if (domObserver || typeof MutationObserver === 'undefined') return;
  domObserver = new MutationObserver(() => {
    pruneDetached();
    reposition();
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function stopObserving(): void {
  domObserver?.disconnect();
  domObserver = null;
}

function reposition(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    pruneDetached();
    for (const { element, box } of tracked) positionBox(box, element);
  });
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') clearHighlights();
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('keydown', onKeyDown, true);
}

export function clearHighlights(): void {
  if (shadow) {
    for (const { box } of tracked) box.remove();
  }
  tracked = [];
  stopObserving();
}

export interface HighlightOptions {
  selectors: string[];
  category: string;
  label?: string;
  pulse?: boolean;
  /**
   * Text or src the element carried when the report was built. A positional
   * selector like `li:nth-of-type(2) > a` keeps resolving after an SPA
   * re-render, just to a different element — this is what stops the highlight
   * landing on the neighbour.
   */
  verify?: string;
}

const VERIFY_LEN = 80;

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, VERIFY_LEN).toLowerCase();
}

/**
 * What the element showed when the box was drawn. A framework that reuses a
 * node across a route change swaps its content but keeps the node, so identity
 * has to be judged by content, not by object reference.
 */
function contentSnapshot(element: Element): string {
  const src = (element as HTMLImageElement).currentSrc || element.getAttribute('src') || '';
  return `${normalise(element.textContent ?? '')}|${normalise(src)}`;
}

function matchesVerify(element: Element, verify?: string): boolean {
  if (!verify) return true;
  const needle = normalise(verify);
  if (!needle) return true;

  const text = normalise(element.textContent ?? '');
  if (text && text === needle) return true;

  const src = (element as HTMLImageElement).currentSrc || element.getAttribute('src') || '';
  if (src && normalise(src).includes(needle)) return true;

  return false;
}

/** Returns how many of the requested selectors actually resolved. */
export function highlight({
  selectors,
  category,
  label,
  pulse,
  verify,
}: HighlightOptions): number {
  clearHighlights();
  const root = ensureHost();
  const color = HIGHLIGHT_COLORS[category] ?? HIGHLIGHT_COLORS.default;

  let matched = 0;
  for (const selector of selectors.slice(0, MAX_BOXES)) {
    let element: Element | null = null;
    try {
      element = document.querySelector(selector);
    } catch {
      continue; // A selector can go stale after a SPA re-render.
    }
    if (!element) continue;
    if (!matchesVerify(element, verify)) continue;

    const box = document.createElement('div');
    box.className = pulse ? 'box pulse' : 'box';
    box.style.setProperty('--c', color);
    if (label) {
      const tag = document.createElement('span');
      tag.className = 'label';
      tag.textContent = label;
      box.appendChild(tag);
    }
    positionBox(box, element);
    root.appendChild(box);
    tracked.push({ element, box, snapshot: contentSnapshot(element) });
    matched += 1;
  }
  if (matched > 0) startObserving();
  return matched;
}

/** Scrolls to a single element and flashes it. False means "no longer there". */
export function scrollTo(
  selector: string,
  category: string,
  label?: string,
  verify?: string,
): boolean {
  let element: Element | null = null;
  try {
    element = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!element || !matchesVerify(element, verify)) return false;

  highlight({ selectors: [selector], category, label, pulse: true, verify });
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  // The smooth scroll finishes after the initial layout pass.
  window.setTimeout(reposition, 400);
  return true;
}
