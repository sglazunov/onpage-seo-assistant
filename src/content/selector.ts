/**
 * Builds a CSS selector that resolves back to the same element from the popup.
 * Prefers a stable id, then falls back to an :nth-of-type path capped in depth
 * so selectors stay short enough to ship inside an export file.
 */
const ID_SAFE = /^[A-Za-z][\w-]*$/;
const MAX_DEPTH = 8;

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

    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);

    node = parent;
    depth += 1;
  }

  return parts.join(' > ');
}
