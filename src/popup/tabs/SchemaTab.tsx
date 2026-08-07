import type { AuditResult } from '../../shared/types';
import { useI18n } from '../i18n-context';
import { Card, CopyButton, Empty, ShowButton, StatGrid } from '../components/ui';

function pretty(raw: string | undefined, parsed: unknown): string {
  if (parsed !== undefined) {
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      /* fall through to the raw text */
    }
  }
  return raw ?? '';
}

export function SchemaTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const blocks = result.page.structuredData;
  const allTypes = [...new Set(blocks.flatMap((b) => b.types).filter(Boolean))];

  if (blocks.length === 0) {
    return (
      <div className="pane">
        <Empty>{t('ui.schema.empty')}</Empty>
      </div>
    );
  }

  return (
    <div className="pane">
      <StatGrid
        stats={[
          { label: t('ui.schema.blocks'), value: blocks.length },
          { label: 'JSON-LD', value: blocks.filter((b) => b.format === 'json-ld').length },
          { label: 'Microdata', value: blocks.filter((b) => b.format === 'microdata').length },
          { label: 'RDFa', value: blocks.filter((b) => b.format === 'rdfa').length },
        ]}
      />

      <p className="chips">
        <span className="muted">{t('ui.schema.types')}: </span>
        {allTypes.length ? (
          allTypes.map((type) => (
            <span className="chip chip--static" key={type}>
              {type}
            </span>
          ))
        ) : (
          <span className="muted">—</span>
        )}
      </p>

      {blocks.map((block, index) => {
        const json = pretty(block.raw, block.parsed);
        return (
          <Card
            key={`${block.selector}-${index}`}
            tone={block.error ? 'error' : undefined}
            title={
              <>
                <code>{block.format}</code>{' '}
                {block.types.length ? block.types.join(', ') : <em>—</em>}
              </>
            }
            actions={
              <>
                {json ? <CopyButton value={json} title={t('ui.schema.copyJson')} /> : null}
                <ShowButton selector={block.selector} category="schema" label={block.format} />
              </>
            }
          >
            {block.error ? (
              <p className="status status--bad">
                {t('ui.schema.invalid')}: {block.error}
              </p>
            ) : null}
            {block.context ? <p className="small muted">@context: {block.context}</p> : null}
            {json ? <pre className="code">{json.slice(0, 4000)}</pre> : null}
          </Card>
        );
      })}
    </div>
  );
}
