// Grammar drills: "가다 + -아요/어요 → ?", answers built and checked by the conjugator.
import { conjugate, form, withParticle, type FormId, type ParticleId, type WordKind } from './conjugate';
import type { GrammarTopic } from './topics';

export interface DrillWord {
  word: string;
  ru: string;
  kind: WordKind;
}

/** Everyday verbs and adjectives, covering every irregular class. */
export const DRILL_WORDS: DrillWord[] = [
  { word: '가다', ru: 'идти', kind: 'verb' },
  { word: '오다', ru: 'приходить', kind: 'verb' },
  { word: '먹다', ru: 'есть', kind: 'verb' },
  { word: '마시다', ru: 'пить', kind: 'verb' },
  { word: '보다', ru: 'смотреть', kind: 'verb' },
  { word: '하다', ru: 'делать', kind: 'verb' },
  { word: '공부하다', ru: 'учиться', kind: 'verb' },
  { word: '만나다', ru: 'встречаться', kind: 'verb' },
  { word: '배우다', ru: 'изучать', kind: 'verb' },
  { word: '읽다', ru: 'читать', kind: 'verb' },
  { word: '앉다', ru: 'сидеть', kind: 'verb' },
  { word: '기다리다', ru: 'ждать', kind: 'verb' },
  { word: '주다', ru: 'давать', kind: 'verb' },
  { word: '입다', ru: 'надевать', kind: 'verb' },
  { word: '받다', ru: 'получать', kind: 'verb' },
  { word: '쉬다', ru: 'отдыхать', kind: 'verb' },
  { word: '일어나다', ru: 'вставать', kind: 'verb' },
  { word: '살다', ru: 'жить', kind: 'verb' },
  { word: '만들다', ru: 'делать, готовить', kind: 'verb' },
  { word: '알다', ru: 'знать', kind: 'verb' },
  { word: '놀다', ru: 'играть, отдыхать', kind: 'verb' },
  { word: '듣다', ru: 'слушать', kind: 'verb' },
  { word: '걷다', ru: 'ходить пешком', kind: 'verb' },
  { word: '쓰다', ru: 'писать', kind: 'verb' },
  { word: '모르다', ru: 'не знать', kind: 'verb' },
  { word: '부르다', ru: 'петь, звать', kind: 'verb' },
  { word: '돕다', ru: 'помогать', kind: 'verb' },
  { word: '짓다', ru: 'строить', kind: 'verb' },
  { word: '좋다', ru: 'хороший', kind: 'adjective' },
  { word: '크다', ru: 'большой', kind: 'adjective' },
  { word: '작다', ru: 'маленький', kind: 'adjective' },
  { word: '바쁘다', ru: 'занятой', kind: 'adjective' },
  { word: '예쁘다', ru: 'красивый', kind: 'adjective' },
  { word: '아프다', ru: 'больной', kind: 'adjective' },
  { word: '덥다', ru: 'жаркий', kind: 'adjective' },
  { word: '춥다', ru: 'холодный', kind: 'adjective' },
  { word: '어렵다', ru: 'трудный', kind: 'adjective' },
  { word: '빠르다', ru: 'быстрый', kind: 'adjective' },
  { word: '길다', ru: 'длинный', kind: 'adjective' },
  { word: '맛있다', ru: 'вкусный', kind: 'adjective' },
  { word: '그렇다', ru: 'такой', kind: 'adjective' },
];

export const DRILL_NOUNS: { word: string; ru: string }[] = [
  { word: '책', ru: 'книга' },
  { word: '학교', ru: 'школа' },
  { word: '물', ru: 'вода' },
  { word: '커피', ru: 'кофе' },
  { word: '사과', ru: 'яблоко' },
  { word: '밥', ru: 'рис, еда' },
  { word: '친구', ru: 'друг' },
  { word: '선생님', ru: 'учитель' },
  { word: '집', ru: 'дом' },
  { word: '서울', ru: 'Сеул' },
  { word: '지하철', ru: 'метро' },
  { word: '버스', ru: 'автобус' },
  { word: '의사', ru: 'врач' },
  { word: '학생', ru: 'студент' },
  { word: '동생', ru: 'младший брат/сестра' },
  { word: '우유', ru: 'молоко' },
  { word: '빵', ru: 'хлеб' },
  { word: '가방', ru: 'сумка' },
  { word: '한국어', ru: 'корейский язык' },
  { word: '연필', ru: 'карандаш' },
];

export interface DrillTask {
  /** The word to change, e.g. 가다 or 책. */
  base: string;
  ru: string;
  /** What to attach, e.g. "-아요/어요". */
  target: string;
  answer: string;
}

const VERB_ONLY: FormId[] = ['request', 'letsFormal', 'want', 'can', 'progressive', 'modPast'];

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Puts the words to ask first (missed last time) at the front, the rest shuffled. */
function preferring<T extends { word: string }>(items: T[], first: readonly string[], random: () => number): T[] {
  const head = first.map((w) => items.find((x) => x.word === w)).filter((x): x is T => !!x);
  return [...head, ...shuffled(items.filter((x) => !head.includes(x)), random)];
}

/** Tasks for a topic (none if it has no drill). Words in `first` are asked first. */
export function makeDrill(topic: GrammarTopic, count = 10, random: () => number = Math.random, first: readonly string[] = []): DrillTask[] {
  const d = topic.drill;
  if (!d) return [];
  if (d.kind === 'particle') {
    return preferring(DRILL_NOUNS, first, random)
      .slice(0, count)
      .map((n) => ({ base: n.word, ru: n.ru, target: topic.pattern.replace(/^N/, '').split(' ')[0], answer: withParticle(n.word, d.particle as ParticleId) }));
  }
  const words = DRILL_WORDS.filter((w) => w.kind === 'verb' || !VERB_ONLY.includes(d.form));
  const out: DrillTask[] = [];
  for (const w of preferring(words, first, random)) {
    const c = conjugate(w.word, w.kind);
    const answer = c && form(c, d.form);
    if (!answer || answer === w.word) continue;
    out.push({ base: w.word, ru: w.ru, target: topic.pattern, answer });
    if (out.length >= count) break;
  }
  return out;
}

/** Compares an answer ignoring spaces at the ends, doubled spaces and final punctuation. */
export function checkDrill(task: DrillTask, given: string): boolean {
  const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '').trim();
  return clean(given) === clean(task.answer);
}
