// Korean verb and adjective conjugation (spelling, not pronunciation) and
// particle choice. Used by the grammar reference, the conjugation table and the
// grammar drills. Pure functions; every irregular class is covered by tests.

const BASE = 0xac00;
// Vowel and final indices of the Unicode Hangul syllable block.
const V = { a: 0, ae: 1, ya: 2, yae: 3, eo: 4, e: 5, yeo: 6, ye: 7, o: 8, wa: 9, wae: 10, oe: 11, yo: 12, u: 13, wo: 14, we: 15, wi: 16, yu: 17, eu: 18, ui: 19, i: 20 };
const F = { none: 0, n: 4, d: 7, l: 8, b: 17, s: 19, ss: 20, h: 27 };
const I_RIEUL = 5;

interface Syl {
  i: number;
  v: number;
  f: number;
}

function parts(ch: string): Syl | null {
  const c = (ch.codePointAt(0) ?? 0) - BASE;
  if (c < 0 || c > 11171) return null;
  return { i: Math.floor(c / 588), v: Math.floor((c % 588) / 28), f: c % 28 };
}

function make(s: Syl): string {
  return String.fromCharCode(BASE + s.i * 588 + s.v * 28 + s.f);
}

const lastOf = (s: string) => parts(s[s.length - 1]);
const init = (s: string) => s.slice(0, -1);
/** Replaces the final consonant of the last syllable. */
function withFinal(s: string, f: number): string {
  const p = lastOf(s)!;
  return init(s) + make({ ...p, f });
}
/** "Bright" vowels take 아, the rest take 어. */
const bright = (v: number) => v === V.a || v === V.ya || v === V.o;

export type WordKind = 'verb' | 'adjective';

export type Irregular =
  | 'regular'
  | 'hada' // 하다 → 해
  | 'l' // ㄹ drops before ㄴ, ㅂ, ㅅ: 살다 → 사세요, 산
  | 'eu' // ㅡ drops: 바쁘다 → 바빠요
  | 'reu' // 르 → ㄹ라/ㄹ러: 모르다 → 몰라요
  | 'reo' // 러: 푸르다 → 푸르러요
  | 'b' // ㅂ → 우: 덥다 → 더워요
  | 'd' // ㄷ → ㄹ: 듣다 → 들어요
  | 's' // ㅅ drops: 낫다 → 나아요
  | 'h' // ㅎ drops: 그렇다 → 그래요
  | 'u'; // 푸다 → 퍼요

const B_REGULAR = new Set(['입', '잡', '좁', '씹', '뽑', '접', '업', '집', '굽히', '수줍', '꼽', '좁']);
const B_IRREGULAR_VERBS = new Set(['돕', '굽', '눕', '줍', '깁']);
const D_IRREGULAR = new Set(['듣', '걷', '묻', '싣', '깨닫', '일컫', '붇', '긷', '알아듣', '엿듣']);
const S_IRREGULAR = new Set(['낫', '짓', '붓', '잇', '긋', '젓', '잣']);
const H_REGULAR = new Set(['좋', '놓', '넣', '낳', '닿', '쌓', '않', '많', '괜찮', '싫', '끓', '잃', '뚫', '옳', '귀찮']);
const REO = new Set(['푸르', '노르', '이르']);
const EU_NOT_REU = new Set(['따르', '치르', '들르', '다다르']);

/** The conjugation class of a word, from its stem. */
export function irregularOf(word: string, kind: WordKind = 'verb'): Irregular {
  const stem = word.endsWith('다') ? word.slice(0, -1) : word;
  const last = lastOf(stem);
  if (!last) return 'regular';
  if (stem.endsWith('하')) return 'hada';
  if (stem === '푸') return 'u';
  if (last.f === F.l) return 'l';
  if (last.v === V.eu && last.f === F.none) {
    if (REO.has(stem.slice(-2))) return 'reo';
    const prev = stem.length > 1 ? parts(stem[stem.length - 2]) : null;
    if (last.i === I_RIEUL && prev && prev.f === F.none && !EU_NOT_REU.has(stem.slice(-2))) return 'reu';
    return 'eu';
  }
  const tail = (n: number) => stem.slice(-n);
  if (last.f === F.b) {
    if ([1, 2].some((n) => B_REGULAR.has(tail(n)))) return 'regular';
    if (kind === 'adjective') return 'b';
    return [1, 2].some((n) => B_IRREGULAR_VERBS.has(tail(n))) ? 'b' : 'regular';
  }
  if (last.f === F.d) return [1, 2, 3].some((n) => D_IRREGULAR.has(tail(n))) ? 'd' : 'regular';
  if (last.f === F.s) return S_IRREGULAR.has(tail(1)) ? 's' : 'regular';
  if (last.f === F.h) return kind === 'adjective' && !H_REGULAR.has(tail(1)) && !H_REGULAR.has(tail(2)) ? 'h' : 'regular';
  return 'regular';
}

/** The 아/어 form ("infinitive"): 가, 먹어, 해, 몰라, 더워, 들어, 나아, 그래, 써. */
export function infinitive(stem: string, cls: Irregular): string {
  const p = lastOf(stem)!;
  const body = init(stem);
  switch (cls) {
    case 'hada':
      return `${body}해`;
    case 'u':
      return `${body}퍼`;
    case 'reo':
      return `${stem}러`;
    case 'reu': {
      const prev = parts(body[body.length - 1])!;
      return `${init(body)}${make({ ...prev, f: F.l })}${bright(prev.v) ? '라' : '러'}`;
    }
    case 'b': {
      const open = make({ ...p, f: F.none });
      return body + open + (stem === '돕' || stem === '곱' ? '와' : '워');
    }
    case 'd':
      return body + make({ ...p, f: F.l }) + (bright(p.v) ? '아' : '어');
    case 's':
      return body + make({ ...p, f: F.none }) + (bright(p.v) ? '아' : '어');
    case 'h': {
      const v = p.v === V.ya || p.v === V.yeo ? V.yae : V.ae;
      return body + make({ ...p, v, f: F.none });
    }
    case 'eu': {
      const prev = body ? parts(body[body.length - 1]) : null;
      return body + make({ i: p.i, v: prev && bright(prev.v) ? V.a : V.eo, f: F.none });
    }
    default:
      break;
  }
  if (p.f !== F.none) return stem + (bright(p.v) ? '아' : '어');
  // Vowel-final stems contract: 가+아 → 가, 오+아 → 와, 주+어 → 줘, 마시+어 → 마셔, 되+어 → 돼.
  const merge: Partial<Record<number, number>> = { [V.a]: V.a, [V.eo]: V.eo, [V.ae]: V.ae, [V.e]: V.e, [V.yeo]: V.yeo, [V.o]: V.wa, [V.u]: V.wo, [V.i]: V.yeo, [V.oe]: V.wae };
  const merged = merge[p.v];
  if (merged !== undefined) return body + make({ ...p, v: merged });
  return stem + (bright(p.v) ? '아' : '어');
}

/** Stem used before -(으) endings: 가, 먹으, 살 (ㄹ kept), 더우, 들으, 나으, 그러. */
function euStem(stem: string, cls: Irregular): string {
  const p = lastOf(stem)!;
  switch (cls) {
    case 'b':
      return init(stem) + make({ ...p, f: F.none }) + '우';
    case 'd':
      return init(stem) + make({ ...p, f: F.l }) + '으';
    case 's':
      return init(stem) + make({ ...p, f: F.none }) + '으';
    case 'h':
      return init(stem) + make({ ...p, f: F.none });
    case 'l':
      return stem;
    default:
      return p.f === F.none ? stem : `${stem}으`;
  }
}

/** -(으)ㄴ, -(으)ㄹ, -(으)ㅂ: adds a final consonant after the -(으) stem (ㄹ stems lose ㄹ). */
function euFinal(stem: string, cls: Irregular, f: number): string {
  const s = euStem(stem, cls);
  return withFinal(s, f);
}

/** -(으)세요, -(으)니까 …: a syllable ending after the -(으) stem (ㄹ stems lose ㄹ before ㅅ and ㄴ). */
function euSyllable(stem: string, cls: Irregular, ending: string): string {
  if (cls === 'l' && /^[세시니]/.test(ending)) return withFinal(stem, F.none) + ending;
  return euStem(stem, cls) + ending;
}

/** Endings starting with ㄴ (-는, -는다, -네요) drop a stem-final ㄹ. */
function consonantN(stem: string, cls: Irregular, ending: string): string {
  return (cls === 'l' ? withFinal(stem, F.none) : stem) + ending;
}

export type FormId =
  | 'dictionary'
  | 'plain'
  | 'polite'
  | 'formal'
  | 'pastPolite'
  | 'pastFormal'
  | 'future'
  | 'negativeAn'
  | 'negativeJi'
  | 'request'
  | 'letsFormal'
  | 'want'
  | 'can'
  | 'progressive'
  | 'and'
  | 'so'
  | 'if'
  | 'because'
  | 'but'
  | 'modPresent'
  | 'modPast'
  | 'modFuture';

export interface Form {
  id: FormId;
  text: string;
  /** Alternative or more usual form, e.g. 드세요 for 먹다. */
  note?: string;
}

export interface Conjugation {
  word: string;
  stem: string;
  kind: WordKind;
  irregular: Irregular;
  forms: Form[];
}

const HONORIFIC: Record<string, string> = { 먹다: '드세요', 마시다: '드세요', 자다: '주무세요', 있다: '계세요', 말하다: '말씀하세요', 죽다: '돌아가셨어요' };
const EXISTENTIAL = /(있|없)다$/;

export interface ConjugateOptions {
  /** For a verb like 공부하다: "공부 안 해요" instead of "안 공부해요". */
  nounHada?: boolean;
}

/** All forms of a verb or adjective in dictionary form (ending in 다). Returns null for anything else. */
export function conjugate(word: string, kind: WordKind = 'verb', opts: ConjugateOptions = {}): Conjugation | null {
  const w = word.trim();
  if (!/^[가-힣]+다$/.test(w) || w.length < 2 || w === '이다') return null;
  const stem = w.slice(0, -1);
  const cls = irregularOf(w, kind);
  const existential = EXISTENTIAL.test(w);
  const verbLike = kind === 'verb' || existential;
  // 아니다 keeps 이 apart: 아니에요, 아니었어요, 아니어서.
  const inf = w === '아니다' ? '아니어' : infinitive(stem, cls);
  const past = withFinal(inf, F.ss);
  const last = lastOf(stem)!;
  const open = last.f === F.none || cls === 'l' || cls === 'hada';
  const formal = (open ? withFinal(cls === 'l' ? withFinal(stem, F.none) : stem, F.b) : `${stem}습`) + '니다';
  const polite = w === '아니다' ? '아니에요' : `${inf}요`;
  const forms: Form[] = [{ id: 'dictionary', text: w }];
  const add = (id: FormId, text: string, note?: string) => forms.push(note ? { id, text, note } : { id, text });

  if (kind === 'verb' && !existential) add('plain', last.f === F.none || cls === 'hada' ? withFinal(stem, F.n) + '다' : cls === 'l' ? withFinal(withFinal(stem, F.none), F.n) + '다' : `${stem}는다`);
  else add('plain', w);
  add('polite', polite);
  add('formal', formal);
  add('pastPolite', `${past}어요`);
  add('pastFormal', `${past}습니다`);
  add('future', `${euFinal(stem, cls, F.l)} 거예요`);
  if (opts.nounHada && cls === 'hada' && stem.length > 1) add('negativeAn', `${stem.slice(0, -1)} 안 해요`);
  else add('negativeAn', `안 ${polite}`);
  add('negativeJi', `${stem}지 않아요`);
  if (kind === 'verb') {
    add('request', euSyllable(stem, cls, '세요'), HONORIFIC[w]);
    add('letsFormal', euFinal(stem, cls, F.b) + '시다');
    add('want', `${stem}고 싶어요`);
    add('can', `${euFinal(stem, cls, F.l)} 수 있어요`);
    add('progressive', `${stem}고 있어요`);
  }
  add('and', `${stem}고`);
  add('so', `${inf}서`);
  add('if', euSyllable(stem, cls, '면'));
  add('because', euSyllable(stem, cls, '니까'));
  add('but', `${stem}지만`);
  add('modPresent', verbLike ? consonantN(stem, cls, '는') : euFinal(stem, cls, F.n));
  if (kind === 'verb') add('modPast', euFinal(stem, cls, F.n));
  add('modFuture', euFinal(stem, cls, F.l));
  return { word: w, stem, kind, irregular: cls, forms };
}

export function form(c: Conjugation, id: FormId): string | undefined {
  return c.forms.find((f) => f.id === id)?.text;
}

// ---------- Particles ----------

export type ParticleId = 'topic' | 'subject' | 'object' | 'and' | 'with' | 'direction' | 'copula' | 'vocative';

const PARTICLES: Record<ParticleId, [string, string]> = {
  // [after a consonant, after a vowel]
  topic: ['은', '는'],
  subject: ['이', '가'],
  object: ['을', '를'],
  and: ['과', '와'],
  with: ['이랑', '랑'],
  direction: ['으로', '로'],
  copula: ['이에요', '예요'],
  vocative: ['아', '야'],
};

/** Attaches a particle, choosing the form by the last sound: 책은, 학교는, 서울로, 집으로. */
export function withParticle(noun: string, id: ParticleId): string {
  const n = noun.trim();
  const p = lastOf(n);
  const [afterConsonant, afterVowel] = PARTICLES[id];
  if (!p) return `${n}${afterConsonant}(${afterVowel})`;
  // -(으)로: ㄹ counts as a vowel here (서울로, 지하철로).
  const consonant = p.f !== F.none && !(id === 'direction' && p.f === F.l);
  return n + (consonant ? afterConsonant : afterVowel);
}

/** Does the word end in a consonant (has 받침)? */
export function hasBatchim(word: string): boolean {
  const p = lastOf(word.trim());
  return !!p && p.f !== F.none;
}

export const FORM_ORDER: FormId[] = ['dictionary', 'plain', 'polite', 'formal', 'pastPolite', 'pastFormal', 'future', 'negativeAn', 'negativeJi', 'request', 'letsFormal', 'want', 'can', 'progressive', 'and', 'so', 'if', 'because', 'but', 'modPresent', 'modPast', 'modFuture'];
