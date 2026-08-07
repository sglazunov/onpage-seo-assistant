import type { KeywordPresence, TermFrequency } from '../../shared/types';
import { LIMITS } from '../../shared/constants';

/**
 * Stop words for Russian and English. Kept deliberately short — the goal is to
 * stop "и / the" from dominating the frequency table, not to do real NLP.
 */
const STOP_WORDS = new Set([
  // ru
  'и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да',
  'ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','еще','нет',
  'о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был',
  'него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может',
  'они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без',
  'будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого',
  'какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','были','куда',
  'зачем','всех','никогда','можно','при','наконец','два','об','другой','хоть','после','над','больше',
  'тот','через','эти','нас','про','всего','них','какая','много','разве','эту','моя','впрочем','свою',
  'этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю',
  // en
  'the','a','an','and','or','but','if','then','than','that','this','these','those','of','in','on',
  'at','to','for','with','by','from','as','is','are','was','were','be','been','being','it','its',
  'we','you','your','our','they','their','he','she','his','her','not','no','so','do','does','did',
  'have','has','had','will','would','can','could','should','may','might','about','into','over',
  'more','most','other','some','such','only','own','same','too','very','just','also','there','here',
]);

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length > 1);
}

export function countWords(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

function toFrequency(counts: Map<string, number>, totalWords: number, limit: number) {
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map<TermFrequency>(([term, count]) => ({
      term,
      count,
      density: totalWords ? Math.round((count / totalWords) * 10000) / 100 : 0,
    }));
}

/** Unigrams drop stop words; n-grams keep them so phrases stay readable. */
export function termFrequencies(text: string, limit = LIMITS.topTerms) {
  const tokens = tokenize(text);
  const total = tokens.length;

  const uni = new Map<string, number>();
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    uni.set(token, (uni.get(token) ?? 0) + 1);
  }

  const bi = new Map<string, number>();
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (STOP_WORDS.has(tokens[i]) && STOP_WORDS.has(tokens[i + 1])) continue;
    const gram = `${tokens[i]} ${tokens[i + 1]}`;
    bi.set(gram, (bi.get(gram) ?? 0) + 1);
  }

  const tri = new Map<string, number>();
  for (let i = 0; i + 2 < tokens.length; i += 1) {
    const gram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
    tri.set(gram, (tri.get(gram) ?? 0) + 1);
  }

  return {
    total,
    unigrams: toFrequency(uni, total, limit),
    bigrams: toFrequency(bi, total, limit),
    trigrams: toFrequency(tri, total, limit),
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(needle);
}

export interface KeywordSources {
  url: string;
  title: string | null;
  description: string | null;
  h1: string[];
  h2: string[];
  firstParagraph: string;
  body: string;
  totalWords: number;
}

/** Reports where a phrase actually appears — no target density is implied. */
export function analyzeKeyword(phrase: string, sources: KeywordSources): KeywordPresence {
  const needle = normalize(phrase);
  const body = normalize(sources.body);
  let occurrences = 0;
  if (needle) {
    let from = 0;
    for (;;) {
      const at = body.indexOf(needle, from);
      if (at === -1) break;
      occurrences += 1;
      from = at + needle.length;
    }
  }
  const phraseWords = countWords(phrase) || 1;
  return {
    url: contains(decodeURIComponent(sources.url), needle),
    title: contains(sources.title, needle),
    description: contains(sources.description, needle),
    h1: sources.h1.some((h) => contains(h, needle)),
    h2: sources.h2.some((h) => contains(h, needle)),
    firstParagraph: contains(sources.firstParagraph, needle),
    body: occurrences > 0,
    occurrences,
    density: sources.totalWords
      ? Math.round(((occurrences * phraseWords) / sources.totalWords) * 10000) / 100
      : 0,
  };
}
