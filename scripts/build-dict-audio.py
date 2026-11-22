#!/usr/bin/env python3
"""Packs pre-made dictionary audio into one SQLite file split into parts for namu-voices.

Usage: build-dict-audio.py <texts.txt> <dir with NNNNNN.webm> <out dir> <voice> [part MB]

texts.txt holds one text per line, exactly as the app keys it (headwordSpeech + speechText);
line i is NNNNNN.webm. Writes <out>/partNN, <out>/manifest.json with sizes and SHA-256.
"""
import hashlib, json, os, sqlite3, sys

texts_file, audio_dir, out_dir, voice = sys.argv[1:5]
part_mb = int(sys.argv[5]) if len(sys.argv) > 5 else 45
texts = [t for t in open(texts_file, encoding='utf-8').read().split('\n') if t]
os.makedirs(out_dir, exist_ok=True)
db_path = os.path.join(out_dir, 'dict-audio.db')
if os.path.exists(db_path):
    os.remove(db_path)
db = sqlite3.connect(db_path)
db.executescript('''
PRAGMA page_size = 65536;  -- 5 KB clips fit inline; 4 KB pages wasted ~20% on overflow
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE audio (text TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
''')
n = 0
for i, t in enumerate(texts):
    f = os.path.join(audio_dir, '%06d.webm' % i)
    if not os.path.exists(f):
        continue
    db.execute('INSERT OR IGNORE INTO audio VALUES (?, ?)', (t, open(f, 'rb').read()))
    n += 1
db.executemany('INSERT INTO meta VALUES (?, ?)', [
    ('format', '1'), ('voice', voice), ('count', str(n)),
    ('model', 'Supertonic 3, Namu pack int8w v2 (INT8 weights, FP16 vocoder)'),
    ('synthesis', 'steps 8, speed 1.0, seed 42, peak normalized to -1 dBFS'),
    ('audio', 'WebM/Opus, mono, 32 kbit/s VBR'),
    ('texts', '한국어기초사전 headwords (CC BY-SA 2.0 KR), read as their main variant'),
    ('license', 'Machine-generated speech made with Supertonic 3 (BigScience OpenRAIL-M). Use restrictions apply; disclose that it is machine-generated.'),
])
db.commit()
db.execute('VACUUM')
db.close()

data = open(db_path, 'rb').read()
size = len(data)
part = part_mb * 1024 * 1024
parts = []
for k in range(0, size, part):
    name = 'part%02d' % (k // part)
    chunk = data[k:k + part]
    open(os.path.join(out_dir, name), 'wb').write(chunk)
    parts.append({'file': name, 'size': len(chunk), 'sha256': hashlib.sha256(chunk).hexdigest()})
manifest = {'count': n, 'voice': voice, 'size': size, 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts}
json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1)
os.remove(db_path)
print(json.dumps({k: v for k, v in manifest.items() if k != 'parts'}), len(parts), 'parts')
