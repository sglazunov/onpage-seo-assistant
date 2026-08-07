/**
 * Builds a CSS selector that resolves back to the same element from the popup.
 * Prefers a stable id, then falls back to an :nth-of-type path capped in depth
 * so selectors stay short enough to ship inside an export file.
 */
const ID_SAFE = /^[A-Za-z][\w-]*$/;
const MAX_DEPTH = 8;

/**
 * Per-element path segment (`div`, `a:nth-of-type(7)`, …).
 *
 * Computing a segment naively means scanning every sibling, which makes a page
 * with 2000 anchors quadratic. Instead the first lookup fills the cache for all
 * children of that parent in a single pass, so a whole document costs O(n).
 */
let cache = new WeakMap<Element, string>();

/** Must run before each collection pass: the DOM may have changed since. */
export function resetSelectorCache(): void {
  // A WeakMap has no clear(); swapping the backing store is the cheap way.
  cache = new WeakMap<Element, string>();
}

function fillSiblingSegments(parent: Element): void {
  const counters = new Map<string, number>();
  const totals = new Map<string, number>();

  for (const child of parent.children) {
    const tag = child.tagName;
    totals.set(tag, (totals.get(tag) ?? 0) + 1);
  }

  for (const child of parent.children) {
    const tag = child.tagName;
    const index = (counters.get(tag) ?? 0) + 1;
    counters.set(tag, index);
    const lower = tag.toLowerCase();
    cache.set(child, totals.get(tag)! > 1 ? `${lower}:nth-of-type(${index})` : lower);
  }
}

function segmentFor(node: Element): string {
  const cached = cache.get(node);
  if (cached !== undefined) return cached;

  const parent = node.parentElement;
  if (!parent) return node.tagName.toLowerCase();

  fillSiblingSegments(parent);
  return cache.get(node) ?? node.tagName.toLowerCase();
}

export function cssPath(element: Element): string {
  if (element.id && ID_SAFE.test(element.id)) {
    // Only trust an id that is actually unique on this page.
    try {
      if (element.ownerDocument.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
        return `#${CSS.escape(element.id)}`;
      }
    } catch {
      /* fall through to the path form */
    }
  }

  const parts: string[] = [];
  let node: Element | null = element;
  let depth = 0;

  while (node && node.nodeType === 1 && depth < MAX_DEPTH) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') {
      parts.unshift(tag);
      break;
    }

    if (node.id && ID_SAFE.test(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }

    if (!node.parentElement) {
      parts.unshift(tag);
      break;
    }

    parts.unshift(segmentFor(node));
    node = node.parentElement;
    depth += 1;
  }

  return parts.join(' > ');
}
