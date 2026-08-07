import type { AuditRule } from './types';
import { group, len } from './types';

export const imageRules: AuditRule[] = [
  {
    id: 'IMG-001',
    category: 'images',
    severity: 'warning',
    applicable: (ctx) => ctx.page.images.length > 0,
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => i.alt === null && !i.isSvg)
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    // alt="" is legitimate for decorative images, so this is informational only.
    id: 'IMG-002',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.length > 0,
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => i.alt === '' && i.visible)
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-003',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.some((i) => Boolean(i.alt)),
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => len(i.alt) > ctx.thresholds.altMax)
          .map((i) => ({
            selector: i.selector,
            value: i.alt ?? '',
            params: { max: ctx.thresholds.altMax },
          })),
      ),
  },
  {
    id: 'IMG-004',
    category: 'images',
    severity: 'warning',
    applicable: (ctx) => ctx.page.images.some((i) => i.visible),
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => i.visible && !i.isSvg && (!i.hasWidthAttr || !i.hasHeightAttr))
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-005',
    category: 'images',
    severity: 'error',
    applicable: (ctx) => ctx.page.images.length > 0,
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => !i.loaded && !i.isSvg && Boolean(i.src))
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-006',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.some((i) => !i.aboveTheFold),
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => !i.aboveTheFold && i.visible && !i.isSvg && i.loading !== 'lazy')
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-010',
    category: 'images',
    severity: 'warning',
    applicable: (ctx) => ctx.page.images.some((i) => i.aboveTheFold),
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => i.aboveTheFold && i.visible && i.loading === 'lazy')
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-007',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.some((i) => i.visible && !i.isSvg),
    run: (ctx) =>
      group(
        ctx.page.images
          // Only worth flagging for images large enough to matter on mobile.
          .filter((i) => i.visible && !i.isSvg && !i.srcset && i.naturalWidth >= 640)
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-008',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.length > 0,
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => !i.visible)
          .map((i) => ({ selector: i.selector, value: i.src })),
      ),
  },
  {
    id: 'IMG-009',
    category: 'images',
    severity: 'info',
    applicable: (ctx) => ctx.page.images.some((i) => i.isSvg),
    run: (ctx) =>
      group(
        ctx.page.images
          .filter((i) => i.isSvg && !i.hasAccessibleName)
          .map((i) => ({ selector: i.selector, value: i.src || 'inline <svg>' })),
      ),
  },
];
