// Parsing and writing word lists: CSV, TSV and plain pasted lists.
import { containsHangul, normalizeHangul } from './hangul';

export interface ImportRow {
  korean: string;
  meanings: string[];
  transcription?: string;
  example?: string;
  exampleTranslation?: string;
}

export interface ImportError {
  line: number;
  text: string;
  reason: 'too_few_columns' | 'empty_field' | 'no_hangul' | 'meaning_not_translation' | 'mixed_korean';
}

export interface ImportResult {
  rows: ImportRow[];
  errors: ImportError[];
  delimiter: string;
}

/** Splits delimited text into records, honouring double-quoted fields. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (src.startsWith(delimiter, i)) {
      row.push(field);
      field = '';
      i += delimiter.length - 1;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DELIMITERS = ['\t', ';', ',', ' — ', ' – ', ' - ', ' = '];

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  for (const d of DELIMITERS) {
    const hits = lines.filter((l) => l.includes(d)).length;
    if (lines.length > 0 && hits >= Math.ceil(lines.length * 0.6)) return d;
  }
  return '\t';
}

const HEADER_WORDS = ['korean', 'word', 'корейск', 'слово', 'translation', 'перевод', '한국어', '단어'];

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return !containsHangul(cells.slice(0, 2).join('').replace(/한국어|단어|번역|뜻/g, '')) && HEADER_WORDS.some((w) => joined.includes(w));
}

/** Letters that are not Hangul: a translation must have some (Russian, English, …). */
const NON_HANGUL_LETTER = /(?![ᄀ-ᇿ㄰-㆏가-힣])\p{L}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Checks that a row is a Korean word and its translation, not two arbitrary strings.
 * Latin letters are allowed in the Korean part (PC방, TV), Cyrillic is not: it means the
 * word and its translation ended up in one column.
 */
export function checkPair(korean: string, meanings: string[]): ImportError['reason'] | null {
  if (!containsHangul(korean)) return 'no_hangul';
  if (CYRILLIC.test(korean)) return 'mixed_korean';
  if (!meanings.some((m) => NON_HANGUL_LETTER.test(m))) return 'meaning_not_translation';
  return null;
}

export function splitMeanings(text: string): string[] {
  return text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Parses a word list. Columns: korean, translation, transcription, example,
 * example translation. The first two may come in either order, line by line:
 * the one with Hangul is the Korean word.
 */
export function parseWordList(text: string, delimiter: string = detectDelimiter(text)): ImportResult {
  const records = parseDelimited(text, delimiter).map((r) => r.map((c) => c.trim()));
  const result: ImportResult = { rows: [], errors: [], delimiter };
  let start = 0;
  if (records.length > 0 && looksLikeHeader(records[0])) start = 1;
  const body = records.slice(start);

  body.forEach((cells, idx) => {
    const line = idx + start + 1;
    if (cells.every((c) => c === '')) return;
    if (cells.length < 2) {
      result.errors.push({ line, text: cells.join(' '), reason: 'too_few_columns' });
      return;
    }
    // Each line may have either order: the Korean word is the side with Hangul.
    const swap = !containsHangul(cells[0]) && containsHangul(cells[1]);
    const korean = normalizeHangul(swap ? cells[1] : cells[0]);
    const meanings = splitMeanings(swap ? cells[0] : cells[1]);
    if (korean === '' || meanings.length === 0) {
      result.errors.push({ line, text: cells.join(' | '), reason: 'empty_field' });
      return;
    }
    const problem = checkPair(korean, meanings);
    if (problem) {
      result.errors.push({ line, text: cells.join(' | '), reason: problem });
      return;
    }
    result.rows.push({
      korean,
      meanings,
      transcription: cells[2] || undefined,
      example: cells[3] || undefined,
      exampleTranslation: cells[4] || undefined,
    });
  });
  return result;
}

function quote(cell: string, delimiter: string): string {
  return cell.includes(delimiter) || /["\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function serializeWordList(rows: ImportRow[], delimiter: ',' | '\t'): string {
  const header = ['korean', 'translation', 'transcription', 'example', 'example_translation'];
  const lines = [header.join(delimiter)];
  for (const r of rows) {
    const cells = [r.korean, r.meanings.join('; '), r.transcription ?? '', r.example ?? '', r.exampleTranslation ?? ''];
    lines.push(cells.map((c) => quote(c, delimiter)).join(delimiter));
  }
  return lines.join('\n') + '\n';
}
