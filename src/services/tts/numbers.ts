// Spells out digits in Korean text before synthesis. The neural voice reads
// digits unreliably ("2026년" came out as 2020 or 1026 in the listening test),
// and Korean reads numbers two ways: Sino-Korean (일, 이, 삼) for dates, money,
// minutes and most units; native Korean (한, 두, 세) with counters such as 개,
// 명, 살 and for the hour.

const SINO_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL_UNITS = ['천', '백', '십', ''];
const BIG_UNITS = ['', '만', '억', '조'];

/** Sino-Korean reading: 15000 → "만 오천", 2026 → "이천이십육". */
export function sino(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return String(n);
  if (n === 0) return '영';
  if (n >= 1e16) return digits(String(n));
  const groups: string[] = [];
  let rest = n;
  for (let g = 0; rest > 0; g++) {
    const part = rest % 10000;
    rest = Math.floor(rest / 10000);
    if (part === 0) continue;
    const ds = String(part).padStart(4, '0');
    let s = '';
    for (let i = 0; i < 4; i++) {
      const d = Number(ds[i]);
      if (d === 0) continue;
      // 10 is 십, not 일십; the same for 백 and 천.
      s += (d === 1 && SMALL_UNITS[i] !== '' ? '' : SINO_DIGITS[d]) + SMALL_UNITS[i];
    }
    // 10000 is 만, not 일만 (but 일억 and 일조 keep the 일).
    if (g === 1 && part === 1) s = '';
    groups.unshift(s + BIG_UNITS[g]);
  }
  return groups.join(' ');
}

const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const ATTRIBUTIVE: Record<string, string> = { 하나: '한', 둘: '두', 셋: '세', 넷: '네' };

/**
 * Native Korean reading for 1–99. With `counter` the short forms are used
 * (한 개, 두 명, 스무 살). Other numbers fall back to Sino-Korean.
 */
export function native(n: number, counter = false): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return sino(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (counter && ones === 0 && tens === 2) return '스무';
  let one = NATIVE_ONES[ones];
  if (counter) one = ATTRIBUTIVE[one] ?? one;
  return NATIVE_TENS[tens] + one;
}

/** Digit by digit, as for phone numbers: 010 → "공일공". */
export function digits(s: string): string {
  return [...s].map((c) => (c === '0' ? '공' : /\d/.test(c) ? SINO_DIGITS[Number(c)] : '')).join('');
}

function month(n: number): string {
  if (n === 6) return '유월';
  if (n === 10) return '시월';
  return `${sino(n)}월`;
}

function hour(n: number): string {
  return n >= 1 && n <= 12 ? `${native(n, true)} 시` : `${sino(n)} 시`;
}

/** Counters read with native numbers (up to 99). Longer forms first: 시간 before 시. */
const NATIVE_COUNTERS = ['시간', '그릇', '켤레', '송이', '군데', '가지', '마리', '사람', '개', '명', '권', '잔', '병', '장', '살', '번', '대', '벌', '곳', '채', '달', '시'];
/** Counters that start like a native one but take Sino-Korean numbers. */
const SINO_OVERRIDES = ['개월', '번지', '번호', '명절', '대학'];
const UNITS: Record<string, string> = {
  '%': '퍼센트',
  km: '킬로미터',
  kg: '킬로그램',
  cm: '센티미터',
  mm: '밀리미터',
  m: '미터',
  g: '그램',
  '℃': '도',
  '°C': '도',
  '°': '도',
};

function counterAfter(rest: string): { counter: string; native: boolean } | null {
  for (const c of SINO_OVERRIDES) if (rest.startsWith(c)) return { counter: c, native: false };
  for (const c of NATIVE_COUNTERS) if (rest.startsWith(c)) return { counter: c, native: true };
  return null;
}

const PHONE = /(?<!\d)(0\d{1,2})-(\d{3,4})-(\d{4})(?!\d)/g;
const DATE = /(?<!\d)(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?(?!\d)/g;
const TIME = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g;
const ORDINAL = /(?<![\d.])(\d{1,2})\s?번째/g;
const DECIMAL = /(?<![\d.])(\d+)\.(\d+)(?![\d.])/g;
const UNIT = /(?<![\d.])(\d[\d,]*)\s?(%|km|kg|cm|mm|℃|°C|°|m|g)(?![A-Za-z])/g;
const NUMBER = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(\s?)/g;

const value = (s: string) => Number(s.replace(/,/g, ''));

/** Replaces every number in the text with its Korean reading. Text without digits is returned unchanged. */
export function normalizeNumbers(input: string): string {
  if (!/\d/.test(input)) return input;
  let t = input;
  t = t.replace(PHONE, (_m, a: string, b: string, c: string) => `${digits(a)} ${digits(b)} ${digits(c)}`);
  t = t.replace(DATE, (_m, y: string, mo: string, d: string) => `${sino(+y)} 년 ${month(+mo)} ${sino(+d)} 일`);
  t = t.replace(TIME, (_m, h: string, mi: string) => (+mi === 0 ? hour(+h) : `${hour(+h)} ${sino(+mi)} 분`));
  t = t.replace(ORDINAL, (_m, n: string) => `${+n === 1 ? '첫' : native(+n, true)} 번째`);
  t = t.replace(DECIMAL, (_m, a: string, b: string) => `${sino(+a)} 점 ${[...b].map((c) => (c === '0' ? '영' : SINO_DIGITS[+c])).join(' ')}`);
  t = t.replace(UNIT, (_m, n: string, u: string) => `${sino(value(n))} ${UNITS[u]}`);
  t = t.replace(NUMBER, (m: string, n: string, space: string, offset: number, whole: string) => {
    // What follows the number decides how it is read: 세 개, 이천이십육 년, 유월.
    const v = value(n);
    const rest = whole.slice(offset + m.length);
    const c = counterAfter(rest);
    if (c?.counter === '시' && !space) return `${hour(v)}`.replace(/ 시$/, ' ');
    if (c && c.native && v >= 1 && v <= 99) return `${native(v, true)} `;
    if (/^월/.test(rest) && !space) return `${month(v).replace(/월$/, '')}`;
    if (/^[가-힣]/.test(rest)) return `${sino(v)} `;
    return `${sino(v)}${space}`;
  });
  return t.replace(/ {2,}/g, ' ').trim();
}
