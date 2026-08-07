import { useEffect, useRef, useState } from 'react';
import type { AuditResult, ExportFormat } from '../../shared/types';
import { buildExport, summaryText } from '../../core/export';
import { copyToClipboard, downloadFile } from '../api';
import { useI18n } from '../i18n-context';

export function ExportMenu({
  result,
  open,
  onClose,
}: {
  result: AuditResult;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Deferred so the click that opened the menu does not immediately close it.
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const download = (format: ExportFormat) => {
    const file = buildExport(result, format);
    downloadFile(file.filename, file.mime, file.content);
    onClose();
  };

  return (
    <div className="menu" ref={ref} role="menu" aria-label={t('ui.export')}>
      {(['json', 'csv', 'markdown', 'html'] as const).map((format) => (
        <button
          key={format}
          type="button"
          role="menuitem"
          className="menu__item"
          onClick={() => download(format)}
        >
          {t(`ui.exportMenu.${format}`)}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className="menu__item"
        onClick={async () => {
          setCopied(await copyToClipboard(summaryText(result)));
          setTimeout(onClose, 700);
        }}
      >
        {copied ? `✓ ${t('ui.copied')}` : t('ui.exportMenu.clipboard')}
      </button>
    </div>
  );
}
