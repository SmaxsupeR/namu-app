# Offline dictionary (krdict.db)

**Source:** 한국어기초사전 (Basic Korean Dictionary), National Institute of Korean
Language (국립국어원), https://krdict.korean.go.kr. Copied from the XML mirror at
https://github.com/spellcheck-ko/korean-dict-nikl-krdict (commit `e7249562dca526461a347eb2cc5a2e67a17c4488`).

**License:** Creative Commons Attribution-ShareAlike 2.0 Korea (CC BY-SA 2.0 KR),
https://creativecommons.org/licenses/by-sa/2.0/kr/. This file, `krdict.db`, is a
derivative work and is distributed under the same license.

**Changes made by Namu:** converted from XML to SQLite by
`scripts/build-dictionary.py`. Kept: headwords, homonym numbers, parts of speech,
learner levels, hanja/origin, pronunciation, the Russian equivalent and Russian
explanation of each sense, the Korean definition and one short Korean example
sentence. Dropped: equivalents in other languages, most examples, related words and
links to recorded pronunciation (whose redistribution is not allowed). Senses without
a Russian equivalent are left out. A search index of Russian terms was added. Two
XML defects in the source (control characters, an unescaped "<") were repaired.

Rebuild:

    git clone --depth 1 https://github.com/spellcheck-ko/korean-dict-nikl-krdict
    python3 scripts/build-dictionary.py korean-dict-nikl-krdict assets/dict/krdict.db <commit>
