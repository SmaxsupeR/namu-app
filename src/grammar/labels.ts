// Russian names of conjugated forms and irregular classes.
import type { FormId, Irregular } from './conjugate';

export const FORM_LABEL: Record<FormId, string> = {
  dictionary: 'Словарная форма',
  plain: 'Простая (письменная) форма',
  polite: 'Настоящее, вежливо (-아요/어요)',
  formal: 'Настоящее, официально (-ㅂ니다/습니다)',
  pastPolite: 'Прошедшее, вежливо (-았어요/었어요)',
  pastFormal: 'Прошедшее, официально (-았습니다)',
  future: 'Будущее (-(으)ㄹ 거예요)',
  negativeAn: 'Отрицание с 안',
  negativeJi: 'Отрицание (-지 않아요)',
  request: 'Просьба (-(으)세요)',
  letsFormal: 'Давайте (-(으)ㅂ시다)',
  want: 'Хочу (-고 싶어요)',
  can: 'Могу (-(으)ㄹ 수 있어요)',
  progressive: 'Сейчас делаю (-고 있어요)',
  and: '«и» (-고)',
  so: '«поэтому», «и затем» (-아서/어서)',
  if: '«если» (-(으)면)',
  because: '«так как» (-(으)니까)',
  but: '«но» (-지만)',
  modPresent: 'Определение, настоящее (-는 / -(으)ㄴ)',
  modPast: 'Определение, прошедшее (-(으)ㄴ)',
  modFuture: 'Определение, будущее (-(으)ㄹ)',
};

/** Main forms shown on a word page. */
export const KEY_FORMS: FormId[] = ['polite', 'pastPolite', 'future', 'formal'];

export const IRREGULAR_LABEL: Record<Irregular, string> = {
  regular: 'Правильный',
  hada: 'На 하다: 하 → 해 (공부해요)',
  l: 'Основа на ㄹ: ㄹ выпадает перед ㄴ, ㅂ, ㅅ (살다 → 사세요, 삽니다)',
  eu: 'Выпадение ㅡ: 바쁘다 → 바빠요, 쓰다 → 써요',
  reu: 'Неправильный на 르: 모르다 → 몰라요',
  reo: 'Неправильный на 러: 푸르다 → 푸르러요',
  b: 'Неправильный на ㅂ: ㅂ → 우 (덥다 → 더워요)',
  d: 'Неправильный на ㄷ: ㄷ → ㄹ перед гласной (듣다 → 들어요)',
  s: 'Неправильный на ㅅ: ㅅ выпадает перед гласной (낫다 → 나아요)',
  h: 'Неправильный на ㅎ: 그렇다 → 그래요, 그런',
  u: 'Неправильный 우: 푸다 → 퍼요',
};

/** Which grammar topic explains a form. */
export const FORM_TOPIC: Partial<Record<FormId, string>> = {
  polite: 'polite',
  formal: 'formal',
  pastPolite: 'past',
  pastFormal: 'past',
  future: 'future',
  negativeAn: 'negation',
  negativeJi: 'negation',
  request: 'request',
  letsFormal: 'lets',
  want: 'want',
  can: 'can',
  progressive: 'progressive',
  and: 'and-connective',
  so: 'so-then',
  if: 'if',
  because: 'because',
  but: 'but',
  modPresent: 'modifiers',
  modPast: 'modifiers',
  modFuture: 'modifiers',
};
