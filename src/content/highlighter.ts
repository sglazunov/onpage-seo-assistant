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
let tracked: { element: Element; box: HTMLDivElement }[] = [];
let rafPending = false;
let listenersAttached = false;

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

function reposition(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
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
}

export interface HighlightOptions {
  selectors: string[];
  category: string;
  label?: string;
  pulse?: boolean;
}

/** Returns how many of the requested selectors actually resolved. */
export function highlight({ selectors, category, label, pulse }: HighlightOptions): number {
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
    tracked.push({ element, box });
    matched += 1;
  }
  return matched;
}

/** Scrolls to a single element and flashes it. */
export function scrollTo(selector: string, category: string, label?: string): boolean {
  let element: Element | null = null;
  try {
    element = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!element) return false;

  highlight({ selectors: [selector], category, label, pulse: true });
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  // The smooth scroll finishes after the initial layout pass.
  window.setTimeout(reposition, 400);
  return true;
}
