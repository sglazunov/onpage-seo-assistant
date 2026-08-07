import { describe, expect, it } from 'vitest';
import { analyzeKeyword, countWords, termFrequencies, tokenize } from '../../src/core/analyzers/text';

describe('tokenize', () => {
  it('handles Cyrillic and Latin alike', () => {
    expect(tokenize('Ноутбук ASUS ZenBook 14')).toEqual(['ноутбук', 'asus', 'zenbook', '14']);
  });

  it('keeps hyphenated words together', () => {
    expect(tokenize('интернет-магазин')).toEqual(['интернет-магазин']);
  });

  it('drops single characters and punctuation', () => {
    expect(tokenize('a — б, вв!')).toEqual(['вв']);
  });
});

describe('countWords', () => {
  it('counts words rather than whitespace runs', () => {
    expect(countWords('  два   слова  ')).toBe(2);
    expect(countWords('')).toBe(0);
  });
});

describe('termFrequencies', () => {
  const text = 'ноутбук купить ноутбук в екатеринбурге купить ноутбук недорого ноутбук';

  it('ranks repeated terms and skips stop words', () => {
    const { unigrams } = termFrequencies(text);
    expect(unigrams[0].term).toBe('ноутбук');
    expect(unigrams[0].count).toBe(4);
    expect(unigrams.some((u) => u.term === 'в')).toBe(false);
  });

  it('computes density as a percentage of all tokens', () => {
    // "в" is dropped as a single-character token, leaving 8 words.
    const { unigrams, total } = termFrequencies(text);
    expect(total).toBe(8);
    expect(unigrams[0].density).toBe(50);
  });

  it('produces bigrams and trigrams', () => {
    const { bigrams, trigrams } = termFrequencies('купить ноутбук дёшево купить ноутбук дёшево');
    expect(bigrams[0].term).toBe('купить ноутбук');
    expect(trigrams[0].term).toBe('купить ноутбук дёшево');
  });

  it('returns empty lists for empty input instead of throwing', () => {
    expect(termFrequencies('').unigrams).toEqual([]);
  });
});

describe('analyzeKeyword', () => {
  const sources = {
    url: 'https://example.com/kupit-noutbuk',
    title: 'Купить ноутбук в Екатеринбурге',
    description: 'Каталог ноутбуков',
    h1: ['Ноутбуки в наличии'],
    h2: ['Купить ноутбук сегодня'],
    firstParagraph: 'Мы поможем купить ноутбук быстро.',
    body: 'Купить ноутбук выгодно. Купить ноутбук просто.',
    totalWords: 8,
  };

  it('reports where the phrase occurs', () => {
    const presence = analyzeKeyword('купить ноутбук', sources);
    expect(presence.title).toBe(true);
    expect(presence.h2).toBe(true);
    expect(presence.firstParagraph).toBe(true);
    expect(presence.h1).toBe(false);
    expect(presence.description).toBe(false);
  });

  it('matches a slug in the URL through hyphen normalisation', () => {
    expect(analyzeKeyword('kupit noutbuk', sources).url).toBe(true);
  });

  it('counts every occurrence in the body', () => {
    const presence = analyzeKeyword('купить ноутбук', sources);
    expect(presence.occurrences).toBe(2);
    expect(presence.density).toBe(50);
  });

  it('returns zeroes for an empty phrase rather than matching everything', () => {
    const presence = analyzeKeyword('', sources);
    expect(presence.occurrences).toBe(0);
    expect(presence.body).toBe(false);
  });
});
