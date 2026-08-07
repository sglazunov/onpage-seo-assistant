import { useMemo, useState } from 'react';
import type { AuditResult, TermFrequency } from '../../shared/types';
import { analyzeKeyword } from '../../core/analyzers/text';
import { MetaIndex } from '../../core/rules';
import { useI18n } from '../i18n-context';
import { DataTable, StatGrid } from '../components/ui';

function FrequencyTable({ terms, labels }: { terms: TermFrequency[]; labels: string[] }) {
  return (
    <DataTable
      headers={labels}
      rows={terms.map((term) => [term.term, term.count, `${term.density}%`])}
      empty="—"
    />
  );
}

export function ContentTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [gram, setGram] = useState<'unigrams' | 'bigrams' | 'trigrams'>('unigrams');
  const content = result.page.content;

  const presence = useMemo(() => {
    if (!phrase.trim()) return null;
    const meta = new MetaIndex(result.page);
    const firstParagraph = content.visibleText.split(/(?<=[.!?])\s/)[0] ?? '';
    return analyzeKeyword(phrase, {
      url: result.finalUrl,
      title: result.page.title,
      description: meta.name('description'),
      h1: result.page.headings.filter((h) => h.level === 1).map((h) => h.text),
      h2: result.page.headings.filter((h) => h.level === 2).map((h) => h.text),
      firstParagraph,
      body: content.visibleText,
      totalWords: content.words,
    });
  }, [phrase, content, result]);

  return (
    <div className="pane">
      <h2 className="pane__title">{t('ui.content.stats')}</h2>
      <StatGrid
        stats={[
          { label: t('ui.content.words'), value: content.words },
          { label: t('ui.content.characters'), value: content.characters },
          { label: t('ui.content.charactersNoSpaces'), value: content.charactersNoSpaces },
          { label: t('ui.content.paragraphs'), value: content.paragraphs },
          { label: t('ui.content.lists'), value: content.lists },
          { label: t('ui.content.tables'), value: content.tables },
          { label: t('ui.content.ratio'), value: `${content.textToHtmlRatio}%` },
          { label: 'Title / H1', value: `${content.titleWords} / ${content.h1Words}` },
        ]}
      />

      <h2 className="pane__title">{t('ui.content.keyword')}</h2>
      <input
        type="search"
        className="input"
        value={phrase}
        onChange={(event) => setPhrase(event.target.value)}
        placeholder={t('ui.content.keywordPlaceholder')}
        aria-label={t('ui.content.keyword')}
      />
      {presence ? (
        <>
          <DataTable
            headers={[t('ui.content.area'), t('ui.content.found')]}
            rows={(
              [
                ['URL', presence.url],
                ['Title', presence.title],
                ['Description', presence.description],
                ['H1', presence.h1],
                ['H2', presence.h2],
                [t('ui.content.firstParagraph'), presence.firstParagraph],
                [t('ui.content.mainText'), presence.body],
              ] as [string, boolean][]
            ).map(([area, found]) => [
              area,
              <span className={found ? 'status status--ok' : 'status status--bad'}>
                {found ? t('ui.yes') : t('ui.no')}
              </span>,
            ])}
          />
          <p className="muted small">
            {t('ui.content.occurrences')}: {presence.occurrences} · {t('ui.content.density')}:{' '}
            {presence.density}%
          </p>
        </>
      ) : null}

      <div className="pane__row">
        <h2 className="pane__title">{t(`ui.content.${gram}`)}</h2>
        <div className="pane__row-actions">
          {(['unigrams', 'bigrams', 'trigrams'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${gram === value ? ' chip--active' : ''}`}
              onClick={() => setGram(value)}
              aria-pressed={gram === value}
            >
              {t(`ui.content.${value}`)}
            </button>
          ))}
        </div>
      </div>
      <FrequencyTable
        terms={content[gram]}
        labels={[t('ui.content.term'), t('ui.content.frequency'), t('ui.content.density')]}
      />

      <p className="disclaimer">{t('ui.content.densityNote')}</p>
    </div>
  );
}
