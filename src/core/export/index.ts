import type { AuditResult, ExportFormat } from '../../shared/types';
import { createTranslate } from '../../shared/i18n';

export interface ExportFile {
  filename: string;
  mime: string;
  content: string;
}

function slug(url: string): string {
  try {
    return new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '-');
  } catch {
    return 'page';
  }
}

function dateStamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildFilename(result: AuditResult, extension: string): string {
  return `seo-audit-${slug(result.finalUrl)}-${dateStamp(result.analyzedAt)}.${extension}`;
}

/* ------------------------------- CSV -------------------------------- */

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvTable(rows: (string | number | null | undefined)[][]): string {
  // A leading BOM makes Excel open UTF-8 correctly on Windows.
  return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function exportIssuesCsv(result: AuditResult): ExportFile {
  const t = createTranslate(result.lang);
  const rows: (string | number)[][] = [
    ['ID', 'Category', 'Severity', 'Title', 'Value', 'Count', 'Selector', 'Recommendation'],
    ...result.issues.map((i) => [
      i.id,
      t(`categories.${i.category}`),
      t(`severity.${i.severity}`),
      i.title,
      i.value ?? '',
      i.count ?? 1,
      i.selector ?? '',
      i.recommendation,
    ]),
  ];
  return {
    filename: buildFilename(result, 'csv'),
    mime: 'text/csv;charset=utf-8',
    content: toCsvTable(rows),
  };
}

export function exportLinksCsv(result: AuditResult): ExportFile {
  const rows: (string | number)[][] = [
    ['URL', 'Anchor', 'Type', 'Rel', 'Target', 'Nofollow', 'Status', 'Redirected to', 'Selector'],
    ...result.page.links.map((l) => [
      l.resolved,
      l.text,
      l.type,
      l.rel.join(' '),
      l.target ?? '',
      l.nofollow ? 'yes' : 'no',
      l.status ?? '',
      l.redirectedTo ?? '',
      l.selector,
    ]),
  ];
  return {
    filename: `seo-links-${slug(result.finalUrl)}-${dateStamp(result.analyzedAt)}.csv`,
    mime: 'text/csv;charset=utf-8',
    content: toCsvTable(rows),
  };
}

export function exportImagesCsv(result: AuditResult): ExportFile {
  const rows: (string | number)[][] = [
    ['SRC', 'ALT', 'Title', 'Width', 'Height', 'Loading', 'Srcset', 'Loaded', 'Visible', 'Selector'],
    ...result.page.images.map((i) => [
      i.src,
      i.alt === null ? '[no alt attribute]' : i.alt,
      i.title ?? '',
      i.naturalWidth,
      i.naturalHeight,
      i.loading ?? '',
      i.srcset ? 'yes' : 'no',
      i.loaded ? 'yes' : 'no',
      i.visible ? 'yes' : 'no',
      i.selector,
    ]),
  ];
  return {
    filename: `seo-images-${slug(result.finalUrl)}-${dateStamp(result.analyzedAt)}.csv`,
    mime: 'text/csv;charset=utf-8',
    content: toCsvTable(rows),
  };
}

/* ------------------------------- JSON ------------------------------- */

export function exportJson(result: AuditResult): ExportFile {
  return {
    filename: buildFilename(result, 'json'),
    mime: 'application/json;charset=utf-8',
    content: JSON.stringify(result, null, 2),
  };
}

/* ----------------------------- Markdown ----------------------------- */

export function exportMarkdown(result: AuditResult): ExportFile {
  const t = createTranslate(result.lang);
  const s = result.score;
  const lines: string[] = [
    `# ${t('ui.appName')} — ${result.pageTitle ?? result.finalUrl}`,
    '',
    `- **URL:** ${result.finalUrl}`,
    `- **${t('ui.analyzedAt')}:** ${new Date(result.analyzedAt).toLocaleString()}`,
    `- **${t('ui.score')}:** ${s.overall}/100`,
    `- **${t('ui.errors')}:** ${s.errors} · **${t('ui.warnings')}:** ${s.warnings} · **${t('ui.infos')}:** ${s.infos} · **${t('ui.passed')}:** ${s.passed}`,
    '',
    `> ${t('ui.scoreDisclaimer')}`,
    '',
    `## ${t('ui.overview.byCategory')}`,
    '',
    `| ${t('ui.overview.byCategory')} | Score | Weight |`,
    '| --- | ---: | ---: |',
    ...s.categories.map(
      (c) => `| ${t(`categories.${c.category}`)} | ${c.score} | ${c.weight} |`,
    ),
    '',
    `## ${t('ui.overview.issues')} (${result.issues.length})`,
    '',
  ];

  if (result.issues.length === 0) {
    lines.push(t('ui.overview.noIssues'), '');
  } else {
    for (const issue of result.issues) {
      const marker = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`### ${marker} ${issue.id} — ${issue.title}`);
      lines.push('');
      lines.push(issue.description);
      if (issue.value) lines.push('', '```', issue.value.slice(0, 500), '```');
      lines.push('', `**${t('ui.recommendation')}:** ${issue.recommendation}`);
      if (issue.count && issue.count > 1) lines.push('', `_${issue.count} ${t('ui.count')}_`);
      lines.push('');
    }
  }

  const meta = result.page;
  lines.push(
    `## ${t('ui.tabs.meta')}`,
    '',
    `| ${t('ui.value')} | ${t('ui.length')} |`,
    '| --- | ---: |',
    `| **Title:** ${meta.title ?? '—'} | ${(meta.title ?? '').length} |`,
    `| **Canonical:** ${meta.canonicalResolved ?? '—'} | |`,
    `| **Lang:** ${meta.htmlLang ?? '—'} | |`,
    '',
    `## ${t('ui.tabs.headings')}`,
    '',
    ...meta.headings.map((h) => `${'  '.repeat(h.level - 1)}- H${h.level}: ${h.text || '—'}`),
    '',
    `## ${t('ui.tabs.content')}`,
    '',
    `- ${t('ui.content.words')}: ${meta.content.words}`,
    `- ${t('ui.content.characters')}: ${meta.content.characters}`,
    `- ${t('ui.content.paragraphs')}: ${meta.content.paragraphs}`,
    `- ${t('ui.links.total')}: ${meta.links.length}`,
    `- ${t('ui.images.total')}: ${meta.images.length}`,
    '',
  );

  return {
    filename: buildFilename(result, 'md'),
    mime: 'text/markdown;charset=utf-8',
    content: lines.join('\n'),
  };
}

/* ------------------------------- HTML ------------------------------- */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlTable(headers: string[], rows: unknown[][]): string {
  return `<table><thead><tr>${headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function exportHtml(result: AuditResult): ExportFile {
  const t = createTranslate(result.lang);
  const s = result.score;
  const band = s.overall >= 80 ? '#16a34a' : s.overall >= 50 ? '#d97706' : '#dc2626';

  const issuesHtml = result.issues.length
    ? result.issues
        .map(
          (i) => `<article class="issue ${i.severity}">
  <h3><span class="badge">${escapeHtml(i.id)}</span> ${escapeHtml(i.title)}</h3>
  <p class="cat">${escapeHtml(t(`categories.${i.category}`))} · ${escapeHtml(t(`severity.${i.severity}`))} · −${i.scoreImpact}</p>
  <p>${escapeHtml(i.description)}</p>
  ${i.value ? `<pre>${escapeHtml(i.value.slice(0, 800))}</pre>` : ''}
  <p class="rec"><strong>${escapeHtml(t('ui.recommendation'))}:</strong> ${escapeHtml(i.recommendation)}</p>
  ${i.selector ? `<p class="sel"><code>${escapeHtml(i.selector)}</code>${i.count && i.count > 1 ? ` — ${i.count} ${escapeHtml(t('ui.count'))}` : ''}</p>` : ''}
</article>`,
        )
        .join('\n')
    : `<p class="ok">${escapeHtml(t('ui.overview.noIssues'))}</p>`;

  const content = `<!doctype html>
<html lang="${escapeHtml(result.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>SEO audit — ${escapeHtml(result.finalUrl)}</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#18181b; --muted:#71717a; --line:#e4e4e7; --card:#fafafa; }
  @media (prefers-color-scheme: dark) { :root { --bg:#18181b; --fg:#f4f4f5; --muted:#a1a1aa; --line:#3f3f46; --card:#27272a; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; font:15px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif; background:var(--bg); color:var(--fg); }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  h3 { font-size: 15px; margin: 0 0 6px; }
  a { color: inherit; }
  .url { color: var(--muted); word-break: break-all; margin: 0 0 16px; }
  .score { display:flex; align-items:center; gap:20px; padding:18px; border:1px solid var(--line); border-radius:10px; background:var(--card); }
  .big { font-size:44px; font-weight:700; color:${band}; line-height:1; }
  .counts { display:flex; gap:18px; flex-wrap:wrap; }
  .counts div { font-size:13px; color:var(--muted); }
  .counts b { display:block; font-size:20px; color:var(--fg); }
  .disclaimer { font-size:12px; color:var(--muted); margin-top:10px; }
  table { border-collapse: collapse; width:100%; font-size:13px; margin-bottom:8px; display:block; overflow-x:auto; }
  th, td { border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; word-break:break-word; }
  th { background:var(--card); position:sticky; top:0; }
  .issue { border:1px solid var(--line); border-left-width:4px; border-radius:8px; padding:12px 14px; margin-bottom:10px; background:var(--card); }
  .issue.error { border-left-color:#dc2626; }
  .issue.warning { border-left-color:#d97706; }
  .issue.info { border-left-color:#2563eb; }
  .badge { font:600 11px/18px monospace; background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:1px 5px; margin-right:6px; }
  .cat, .sel { font-size:12px; color:var(--muted); margin:2px 0; }
  pre { background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:8px; overflow-x:auto; font-size:12px; }
  .ok { color:#16a34a; font-weight:600; }
  footer { margin-top:32px; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<div class="wrap">
<h1>${escapeHtml(result.pageTitle ?? t('ui.appName'))}</h1>
<p class="url"><a href="${escapeHtml(result.finalUrl)}">${escapeHtml(result.finalUrl)}</a><br>${escapeHtml(t('ui.analyzedAt'))}: ${escapeHtml(new Date(result.analyzedAt).toLocaleString())}</p>

<div class="score">
  <div><div class="big">${s.overall}</div><div style="font-size:12px;color:var(--muted)">${escapeHtml(t('ui.score'))} / 100</div></div>
  <div class="counts">
    <div><b>${s.errors}</b>${escapeHtml(t('ui.errors'))}</div>
    <div><b>${s.warnings}</b>${escapeHtml(t('ui.warnings'))}</div>
    <div><b>${s.infos}</b>${escapeHtml(t('ui.infos'))}</div>
    <div><b>${s.passed}</b>${escapeHtml(t('ui.passed'))}</div>
    <div><b>${s.groups.technical}</b>${escapeHtml(t('ui.groups.technical'))}</div>
    <div><b>${s.groups.content}</b>${escapeHtml(t('ui.groups.content'))}</div>
    <div><b>${s.groups.social}</b>${escapeHtml(t('ui.groups.social'))}</div>
  </div>
</div>
<p class="disclaimer">${escapeHtml(t('ui.scoreDisclaimer'))}</p>

<h2>${escapeHtml(t('ui.overview.byCategory'))}</h2>
${htmlTable(
  [t('ui.overview.byCategory'), t('ui.score'), 'Weight', t('ui.errors'), t('ui.warnings'), t('ui.infos')],
  s.categories.map((c) => [
    t(`categories.${c.category}`),
    c.score,
    c.weight,
    c.errors,
    c.warnings,
    c.infos,
  ]),
)}

<h2>${escapeHtml(t('ui.overview.issues'))} (${result.issues.length})</h2>
${issuesHtml}

<h2>${escapeHtml(t('ui.tabs.meta'))}</h2>
${htmlTable(
  ['Tag', t('ui.value'), t('ui.length')],
  [
    ['title', result.page.title ?? '—', (result.page.title ?? '').length],
    ['description', result.page.metas.find((m) => m.key.toLowerCase() === 'description')?.content ?? '—', (result.page.metas.find((m) => m.key.toLowerCase() === 'description')?.content ?? '').length],
    ['canonical', result.page.canonicalResolved ?? '—', ''],
    ['robots', result.page.metas.find((m) => m.key.toLowerCase() === 'robots')?.content ?? '—', ''],
    ['viewport', result.page.metas.find((m) => m.key.toLowerCase() === 'viewport')?.content ?? '—', ''],
    ['html lang', result.page.htmlLang ?? '—', ''],
    ['charset', result.page.charset ?? '—', ''],
  ],
)}

<h2>${escapeHtml(t('ui.tabs.headings'))} (${result.page.headings.length})</h2>
${htmlTable(
  ['Level', t('ui.value'), t('ui.status')],
  result.page.headings.map((h) => [
    `H${h.level}`,
    `${'— '.repeat(h.level - 1)}${h.text || '—'}`,
    h.visible ? '' : t('ui.headings.hidden'),
  ]),
)}

<h2>${escapeHtml(t('ui.tabs.links'))} (${result.page.links.length})</h2>
${htmlTable(
  ['URL', t('ui.links.anchor'), 'Type', 'Rel', 'Status'],
  result.page.links
    .slice(0, 500)
    .map((l) => [l.resolved, l.text || t('ui.links.noAnchor'), l.type, l.rel.join(' '), l.status ?? '']),
)}

<h2>${escapeHtml(t('ui.tabs.images'))} (${result.page.images.length})</h2>
${htmlTable(
  ['SRC', 'ALT', t('ui.images.dimensions'), 'loading'],
  result.page.images
    .slice(0, 500)
    .map((i) => [
      i.src || 'inline <svg>',
      i.alt === null ? '[no alt]' : i.alt || '[empty]',
      `${i.naturalWidth}×${i.naturalHeight}`,
      i.loading ?? '',
    ]),
)}

<footer>${escapeHtml(t('ui.appName'))} v${escapeHtml(result.version)} · ${escapeHtml(t('ui.scoreDisclaimer'))}</footer>
</div>
</body>
</html>`;

  return {
    filename: buildFilename(result, 'html'),
    mime: 'text/html;charset=utf-8',
    content,
  };
}

/* ---------------------------- Clipboard ----------------------------- */

export function summaryText(result: AuditResult): string {
  const t = createTranslate(result.lang);
  const s = result.score;
  const top = result.issues
    .filter((i) => i.severity !== 'info')
    .slice(0, 10)
    .map((i) => `- [${i.id}] ${i.title}${i.count && i.count > 1 ? ` (${i.count})` : ''}`);

  return [
    `${t('ui.appName')} — ${result.finalUrl}`,
    `${t('ui.score')}: ${s.overall}/100 (technical ${s.groups.technical} · content ${s.groups.content} · social ${s.groups.social})`,
    `${t('ui.errors')}: ${s.errors} · ${t('ui.warnings')}: ${s.warnings} · ${t('ui.infos')}: ${s.infos}`,
    '',
    ...(top.length ? top : [t('ui.overview.noIssues')]),
    '',
    t('ui.scoreDisclaimer'),
  ].join('\n');
}

export function buildExport(result: AuditResult, format: ExportFormat): ExportFile {
  switch (format) {
    case 'json':
      return exportJson(result);
    case 'csv':
      return exportIssuesCsv(result);
    case 'markdown':
      return exportMarkdown(result);
    case 'html':
      return exportHtml(result);
    default:
      return exportJson(result);
  }
}
