import { describe, expect, it } from 'vitest';
import { digits, native, normalizeNumbers, sino } from './numbers';

describe('Sino-Korean numbers', () => {
  it.each([
    [0, '영'], [1, '일'], [10, '십'], [11, '십일'], [20, '이십'], [100, '백'], [101, '백일'], [110, '백십'],
    [1000, '천'], [2026, '이천이십육'], [10000, '만'], [15000, '만 오천'], [20000, '이만'], [100000, '십만'],
    [1000000, '백만'], [12345678, '천이백삼십사만 오천육백칠십팔'], [100000000, '일억'], [100010000, '일억 만'],
  ])('%i → %s', (n, s) => expect(sino(n)).toBe(s));
});

describe('native Korean numbers', () => {
  it.each([
    [1, false, '하나'], [1, true, '한'], [2, true, '두'], [3, true, '세'], [4, true, '네'], [5, true, '다섯'],
    [10, true, '열'], [11, true, '열한'], [20, false, '스물'], [20, true, '스무'], [21, true, '스물한'], [99, true, '아흔아홉'],
  ])('%i (counter %s) → %s', (n, c, s) => expect(native(n, c)).toBe(s));
  it('falls back to Sino-Korean outside 1–99', () => expect(native(100, true)).toBe('백'));
});

describe('normalizeNumbers', () => {
  it.each([
    ['2026년', '이천이십육 년'],
    ['2026년 6월 15일', '이천이십육 년 유월 십오 일'],
    ['10월', '시월'],
    ['1월', '일월'],
    ['2026.11.20', '이천이십육 년 십일월 이십 일'],
    ['3시 30분', '세 시 삼십 분'],
    ['12시', '열두 시'],
    ['15:45', '십오 시 사십오 분'],
    ['9:00', '아홉 시'],
    ['사과 3개', '사과 세 개'],
    ['학생 20명', '학생 스무 명'],
    ['25살', '스물다섯 살'],
    ['25세', '이십오 세'],
    ['3개월', '삼 개월'],
    ['2시간', '두 시간'],
    ['고양이 1마리', '고양이 한 마리'],
    ['150개', '백오십 개'],
    ['15,000원', '만 오천 원'],
    ['3500원', '삼천오백 원'],
    ['010-1234-5678', '공일공 일이삼사 오육칠팔'],
    ['3.5', '삼 점 오'],
    ['50%', '오십 퍼센트'],
    ['5km', '오 킬로미터'],
    ['1번째', '첫 번째'],
    ['2번째', '두 번째'],
    ['3층', '삼 층'],
    ['42', '사십이'],
    ['책 3 권', '책 세 권'],
  ])('%s → %s', (a, b) => expect(normalizeNumbers(a)).toBe(b));

  it('leaves text without digits untouched', () => {
    expect(normalizeNumbers('학교에 가요.')).toBe('학교에 가요.');
  });

  it('reads phone digits with 공 for zero', () => expect(digits('010')).toBe('공일공'));

  it('keeps the rest of a sentence', () => {
    expect(normalizeNumbers('저는 2026년에 25살이에요.')).toBe('저는 이천이십육 년에 스물다섯 살이에요.');
  });
});
