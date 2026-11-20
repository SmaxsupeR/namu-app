#!/usr/bin/env python3
"""Builds the offline Korean–Russian dictionary (assets/dict/krdict.db) from the
XML of 한국어기초사전 (Basic Korean Dictionary, National Institute of Korean
Language), licensed CC BY-SA 2.0 KR. The XML is mirrored at
https://github.com/spellcheck-ko/korean-dict-nikl-krdict.

Usage: build-dictionary.py <xml dir> <out.db> <source commit>

Kept per entry: headword, homonym number, part of speech, learner level,
hanja origin, pronunciation; per sense: the Russian equivalent and its
Russian definition, the Korean definition and one short Korean example.
Recorded audio links are dropped (their redistribution is not allowed).
"""
import glob, io, os, re, sqlite3, sys, unicodedata
import xml.etree.ElementTree as ET

src, out, commit = sys.argv[1], sys.argv[2], sys.argv[3]
LEVELS = {'초급': 1, '중급': 2, '고급': 3}
UNITS = {'단어': 'word', '구': 'phrase', '관용구': 'idiom', '속담': 'proverb', '문법‧표현': 'grammar'}

def feats(el):
    return {f.get('att'): f.get('val') for f in el.findall('feat')}

def clean(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFC', s).replace('&quot;', '"').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip().strip(';').strip()

def ru_key(s):
    return re.sub(r'[^0-9a-zа-я\- ]', '', s.lower().replace('ё', 'е')).strip()

if os.path.exists(out):
    os.remove(out)
db = sqlite3.connect(out)
db.executescript('''
PRAGMA page_size = 4096;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE words (
  id INTEGER PRIMARY KEY,
  src_id INTEGER NOT NULL,         -- krdict entry id (idioms share their headword's id)
  word TEXT NOT NULL,
  hom INTEGER NOT NULL,            -- homonym number
  unit TEXT NOT NULL,              -- word, phrase, idiom, proverb, grammar
  pos TEXT NOT NULL,               -- Korean part-of-speech name
  level INTEGER NOT NULL,          -- 1 beginner, 2 intermediate, 3 advanced, 0 none
  origin TEXT,                     -- hanja or source word
  pron TEXT
);
CREATE TABLE senses (
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL,
  n INTEGER NOT NULL,
  ru TEXT NOT NULL,                -- Russian equivalent, e.g. "школа"
  ru_def TEXT,                     -- Russian explanation
  ko_def TEXT,
  example TEXT
);
-- Russian search terms: every equivalent ("старшая школа", exact = 1) and its longer words ("школа", exact = 0).
CREATE TABLE ru_index (term TEXT NOT NULL, sense_id INTEGER NOT NULL, exact INTEGER NOT NULL, PRIMARY KEY (term, sense_id)) WITHOUT ROWID;
''')
n_words = n_senses = 0
for path in sorted(glob.glob(os.path.join(src, '*.xml')), key=lambda p: int(re.sub(r'\D', '', os.path.basename(p)) or 0)):
    # Some files contain control characters, or a bare "<" inside a value; repair both before parsing.
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', open(path, encoding='utf-8').read())
    text = re.sub(r'val="([^"]*)"', lambda m: 'val="' + m.group(1).replace('<', '&lt;') + '"', text)
    for _, el in ET.iterparse(io.StringIO(text), events=('end',)):
        if el.tag != 'LexicalEntry':
            continue
        f = feats(el)
        lemma = el.find('Lemma')
        word = clean(feats(lemma).get('writtenForm')) if lemma is not None else ''
        unit = UNITS.get(f.get('lexicalUnit', ''), 'word')
        senses = []
        for i, s in enumerate(el.findall('Sense'), 1):
            sf = feats(s)
            ru = ru_def = None
            for eq in s.findall('Equivalent'):
                ef = feats(eq)
                if ef.get('language') == '러시아어':
                    ru, ru_def = clean(ef.get('lemma')), clean(ef.get('definition'))
            if not ru:
                continue
            example = None
            for ex in s.findall('SenseExample'):
                xf = feats(ex)
                if xf.get('type') == '문장' and xf.get('example') and len(xf['example']) <= 60:
                    example = clean(xf['example'])
                    break
            senses.append((i, ru, ru_def or None, clean(sf.get('definition')) or None, example))
        if word and senses:
            pron = None
            for wf in el.findall('WordForm'):
                pf = feats(wf)
                if pf.get('type') == '발음' and pf.get('pronunciation'):
                    pron = clean(pf['pronunciation'])
                    break
            wid = db.execute('INSERT INTO words (src_id, word, hom, unit, pos, level, origin, pron) VALUES (?,?,?,?,?,?,?,?)', (int(el.get('val')), word, int(f.get('homonym_number') or 0), unit, f.get('partOfSpeech') or '',
                                                                   LEVELS.get(f.get('vocabularyLevel'), 0), clean(f.get('origin')) or None, pron)).lastrowid
            n_words += 1
            for (i, ru, ru_def, ko_def, example) in senses:
                cur = db.execute('INSERT INTO senses (word_id, n, ru, ru_def, ko_def, example) VALUES (?,?,?,?,?,?)', (wid, i, ru, ru_def, ko_def, example))
                sid = cur.lastrowid
                n_senses += 1
                terms = set()
                for part in re.split(r'[;,]', ru):
                    k = ru_key(re.sub(r'\(.*?\)', '', part))
                    if not k:
                        continue
                    terms.add((k, 1))
                    for w in k.split():
                        if len(w) >= 3 and w != k:
                            terms.add((w, 0))
                best = {}
                for t, e in terms:
                    best[t] = max(best.get(t, 0), e)
                db.executemany('INSERT INTO ru_index VALUES (?,?,?)', [(t, sid, e) for t, e in best.items()])
        el.clear()
db.executescript('''
CREATE INDEX ix_words_word ON words(word);
CREATE INDEX ix_senses_word ON senses(word_id, n);
''')
db.executemany('INSERT INTO meta VALUES (?,?)', [
    ('format', '1'),
    ('source', '한국어기초사전 (Basic Korean Dictionary), National Institute of Korean Language, https://krdict.korean.go.kr'),
    ('license', 'CC BY-SA 2.0 KR'),
    ('mirror', f'https://github.com/spellcheck-ko/korean-dict-nikl-krdict@{commit}'),
    ('changes', 'Converted to SQLite by Namu; only Russian equivalents, Korean definitions and one short example per sense kept; audio links removed.'),
    ('words', str(n_words)),
    ('senses', str(n_senses)),
])
db.commit()
db.execute('VACUUM')
db.close()
print(f'{n_words} words, {n_senses} senses, {os.path.getsize(out) / 1048576:.1f} MB')
