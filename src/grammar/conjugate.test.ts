import { describe, expect, it } from 'vitest';
import { conjugate, form, hasBatchim, irregularOf, withParticle, type FormId, type WordKind } from './conjugate';

type Row = [string, WordKind, Partial<Record<FormId, string>>];

// Expected forms checked against standard grammar references.
const TABLE: Row[] = [
  ['가다', 'verb', { plain: '간다', polite: '가요', formal: '갑니다', pastPolite: '갔어요', pastFormal: '갔습니다', future: '갈 거예요', request: '가세요', letsFormal: '갑시다', so: '가서', if: '가면', because: '가니까', modPresent: '가는', modPast: '간', modFuture: '갈', negativeAn: '안 가요', negativeJi: '가지 않아요', want: '가고 싶어요', can: '갈 수 있어요' }],
  ['먹다', 'verb', { plain: '먹는다', polite: '먹어요', formal: '먹습니다', pastPolite: '먹었어요', future: '먹을 거예요', request: '먹으세요', letsFormal: '먹읍시다', so: '먹어서', if: '먹으면', because: '먹으니까', modPresent: '먹는', modPast: '먹은', modFuture: '먹을' }],
  ['오다', 'verb', { polite: '와요', pastPolite: '왔어요', so: '와서' }],
  ['보다', 'verb', { polite: '봐요', pastPolite: '봤어요' }],
  ['주다', 'verb', { polite: '줘요', pastPolite: '줬어요' }],
  ['배우다', 'verb', { polite: '배워요', pastPolite: '배웠어요', formal: '배웁니다' }],
  ['마시다', 'verb', { polite: '마셔요', pastPolite: '마셨어요', request: '마시세요' }],
  ['기다리다', 'verb', { polite: '기다려요' }],
  ['되다', 'verb', { polite: '돼요', pastPolite: '됐어요' }],
  ['보내다', 'verb', { polite: '보내요', pastPolite: '보냈어요' }],
  ['서다', 'verb', { polite: '서요' }],
  ['켜다', 'verb', { polite: '켜요' }],
  ['쉬다', 'verb', { polite: '쉬어요', pastPolite: '쉬었어요' }],
  ['앉다', 'verb', { polite: '앉아요', request: '앉으세요', formal: '앉습니다' }],
  ['읽다', 'verb', { polite: '읽어요', plain: '읽는다', modPast: '읽은' }],
  ['공부하다', 'verb', { plain: '공부한다', polite: '공부해요', formal: '공부합니다', pastPolite: '공부했어요', request: '공부하세요', so: '공부해서' }],
  ['일하다', 'verb', { polite: '일해요' }],
  // ㄹ drops before ㄴ, ㅂ, ㅅ
  ['살다', 'verb', { plain: '산다', polite: '살아요', formal: '삽니다', pastPolite: '살았어요', future: '살 거예요', request: '사세요', letsFormal: '삽시다', if: '살면', because: '사니까', modPresent: '사는', modPast: '산', modFuture: '살' }],
  ['만들다', 'verb', { polite: '만들어요', formal: '만듭니다', request: '만드세요', modPresent: '만드는' }],
  ['알다', 'verb', { polite: '알아요', formal: '압니다', modPresent: '아는' }],
  ['길다', 'adjective', { polite: '길어요', formal: '깁니다', modPresent: '긴', plain: '길다' }],
  // ㅡ drops
  ['쓰다', 'verb', { polite: '써요', pastPolite: '썼어요' }],
  ['바쁘다', 'adjective', { polite: '바빠요', pastPolite: '바빴어요', modPresent: '바쁜' }],
  ['예쁘다', 'adjective', { polite: '예뻐요' }],
  ['아프다', 'adjective', { polite: '아파요' }],
  ['슬프다', 'adjective', { polite: '슬퍼요' }],
  ['크다', 'adjective', { polite: '커요', modPresent: '큰', formal: '큽니다' }],
  ['따르다', 'verb', { polite: '따라요' }],
  ['들르다', 'verb', { polite: '들러요' }],
  // 르
  ['모르다', 'verb', { polite: '몰라요', pastPolite: '몰랐어요', formal: '모릅니다', modPresent: '모르는' }],
  ['부르다', 'verb', { polite: '불러요' }],
  ['빠르다', 'adjective', { polite: '빨라요', modPresent: '빠른' }],
  ['다르다', 'adjective', { polite: '달라요' }],
  ['고르다', 'verb', { polite: '골라요' }],
  // ㅂ
  ['덥다', 'adjective', { polite: '더워요', pastPolite: '더웠어요', formal: '덥습니다', modPresent: '더운', if: '더우면', future: '더울 거예요' }],
  ['춥다', 'adjective', { polite: '추워요' }],
  ['어렵다', 'adjective', { polite: '어려워요', modPresent: '어려운' }],
  ['아름답다', 'adjective', { polite: '아름다워요' }],
  ['고맙다', 'adjective', { polite: '고마워요' }],
  ['돕다', 'verb', { polite: '도와요', request: '도우세요', pastPolite: '도왔어요' }],
  ['눕다', 'verb', { polite: '누워요' }],
  ['입다', 'verb', { polite: '입어요', request: '입으세요' }],
  ['잡다', 'verb', { polite: '잡아요' }],
  ['좁다', 'adjective', { polite: '좁아요', modPresent: '좁은' }],
  // ㄷ
  ['듣다', 'verb', { polite: '들어요', pastPolite: '들었어요', formal: '듣습니다', request: '들으세요', modPresent: '듣는', modPast: '들은', if: '들으면' }],
  ['걷다', 'verb', { polite: '걸어요' }],
  ['받다', 'verb', { polite: '받아요' }],
  ['닫다', 'verb', { polite: '닫아요' }],
  // ㅅ
  ['낫다', 'verb', { polite: '나아요', if: '나으면' }],
  ['짓다', 'verb', { polite: '지어요' }],
  ['웃다', 'verb', { polite: '웃어요' }],
  ['씻다', 'verb', { polite: '씻어요' }],
  // ㅎ
  ['그렇다', 'adjective', { polite: '그래요', pastPolite: '그랬어요', modPresent: '그런', if: '그러면', formal: '그렇습니다' }],
  ['어떻다', 'adjective', { polite: '어때요' }],
  ['빨갛다', 'adjective', { polite: '빨개요', modPresent: '빨간' }],
  ['하얗다', 'adjective', { polite: '하얘요' }],
  ['좋다', 'adjective', { polite: '좋아요', modPresent: '좋은' }],
  ['놓다', 'verb', { polite: '놓아요' }],
  // others
  ['푸르다', 'adjective', { polite: '푸르러요' }],
  ['푸다', 'verb', { polite: '퍼요' }],
  ['있다', 'verb', { polite: '있어요', plain: '있다', modPresent: '있는' }],
  ['맛있다', 'adjective', { polite: '맛있어요', modPresent: '맛있는' }],
  ['없다', 'adjective', { modPresent: '없는', formal: '없습니다' }],
  ['작다', 'adjective', { modPresent: '작은', polite: '작아요' }],
  ['깨끗하다', 'adjective', { polite: '깨끗해요', modPresent: '깨끗한' }],
  ['아니다', 'adjective', { polite: '아니에요', pastPolite: '아니었어요', formal: '아닙니다', so: '아니어서' }],
  ['하다', 'verb', { polite: '해요', pastPolite: '했어요', formal: '합니다', modPresent: '하는' }],
];

describe('conjugation', () => {
  it.each(TABLE)('%s', (word, kind, expected) => {
    const c = conjugate(word, kind)!;
    for (const [id, text] of Object.entries(expected)) expect(`${id}: ${form(c, id as FormId)}`).toBe(`${id}: ${text}`);
  });

  it('classifies irregular verbs', () => {
    expect(irregularOf('덥다', 'adjective')).toBe('b');
    expect(irregularOf('입다', 'verb')).toBe('regular');
    expect(irregularOf('듣다')).toBe('d');
    expect(irregularOf('받다')).toBe('regular');
    expect(irregularOf('모르다')).toBe('reu');
    expect(irregularOf('따르다')).toBe('eu');
    expect(irregularOf('그렇다', 'adjective')).toBe('h');
    expect(irregularOf('좋다', 'adjective')).toBe('regular');
    expect(irregularOf('살다')).toBe('l');
  });

  it('puts 안 inside noun + 하다 verbs', () => {
    expect(form(conjugate('공부하다', 'verb', { nounHada: true })!, 'negativeAn')).toBe('공부 안 해요');
    expect(form(conjugate('좋아하다', 'verb')!, 'negativeAn')).toBe('안 좋아해요');
  });

  it('gives the honorific verb where Koreans use one', () => {
    expect(conjugate('먹다')!.forms.find((f) => f.id === 'request')?.note).toBe('드세요');
  });

  it('leaves adjectives without verb-only forms', () => {
    const c = conjugate('크다', 'adjective')!;
    expect(form(c, 'want')).toBeUndefined();
    expect(form(c, 'request')).toBeUndefined();
  });

  it('refuses words that are not in dictionary form', () => {
    expect(conjugate('학교')).toBeNull();
    expect(conjugate('가요')).toBeNull();
    expect(conjugate('이다')).toBeNull();
    expect(conjugate('go다')).toBeNull();
  });
});

describe('particles', () => {
  it.each([
    ['책', 'topic', '책은'], ['학교', 'topic', '학교는'],
    ['물', 'subject', '물이'], ['커피', 'subject', '커피가'],
    ['밥', 'object', '밥을'], ['사과', 'object', '사과를'],
    ['빵', 'and', '빵과'], ['우유', 'and', '우유와'],
    ['서울', 'direction', '서울로'], ['집', 'direction', '집으로'], ['학교', 'direction', '학교로'],
    ['학생', 'copula', '학생이에요'], ['의사', 'copula', '의사예요'],
    ['민준', 'vocative', '민준아'], ['지수', 'vocative', '지수야'],
  ] as const)('%s + %s → %s', (noun, id, out) => expect(withParticle(noun, id)).toBe(out));

  it('knows batchim', () => {
    expect(hasBatchim('책')).toBe(true);
    expect(hasBatchim('나무')).toBe(false);
  });
});
