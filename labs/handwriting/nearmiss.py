"""Can the model tell a correctly written word from a near miss (one jamo wrong)?

A learner's real mistakes are close to the answer: 학고 for 학교, 선생닌 for 선생님. For every
handwritten word W we build near misses of W and ask: if the expected answer were a near
miss X (so the learner actually wrote something else), would we wrongly accept?

Reports, for the real-stroke words and the font words:
  pick_near  W scores best among W and 3 near misses
  verify     share of correct words accepted when at most 1 % / 5 % of near misses pass
"""
import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from eval import Rec, render_font, render_strokes, split_words  # noqa: E402

L = list('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ')
V = list('ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ')
T = [''] + list('ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ')
# confusions a learner makes: similar sounds or shapes
SIM_L = {'ㄱ': 'ㅋㄲ', 'ㅋ': 'ㄱㄲ', 'ㄲ': 'ㄱㅋ', 'ㄷ': 'ㅌㄸ', 'ㅌ': 'ㄷㄸ', 'ㄸ': 'ㄷㅌ', 'ㅂ': 'ㅍㅃ', 'ㅍ': 'ㅂㅃ',
         'ㅃ': 'ㅂㅍ', 'ㅈ': 'ㅊㅉ', 'ㅊ': 'ㅈㅉ', 'ㅉ': 'ㅈㅊ', 'ㅅ': 'ㅆ', 'ㅆ': 'ㅅ', 'ㄴ': 'ㄹㅁ', 'ㄹ': 'ㄴ', 'ㅁ': 'ㄴㅂ',
         'ㅇ': 'ㅎ', 'ㅎ': 'ㅇ'}
SIM_V = {'ㅓ': 'ㅗㅕ', 'ㅗ': 'ㅓㅜ', 'ㅜ': 'ㅗㅡ', 'ㅡ': 'ㅜㅣ', 'ㅐ': 'ㅔㅒ', 'ㅔ': 'ㅐㅖ', 'ㅕ': 'ㅓㅛ', 'ㅛ': 'ㅗㅕ',
         'ㅠ': 'ㅜㅛ', 'ㅏ': 'ㅑㅓ', 'ㅑ': 'ㅏ', 'ㅣ': 'ㅡ', 'ㅚ': 'ㅙㅞ', 'ㅙ': 'ㅚㅞ', 'ㅞ': 'ㅙㅚ', 'ㅘ': 'ㅝ', 'ㅝ': 'ㅘ',
         'ㅟ': 'ㅢ', 'ㅢ': 'ㅟㅡ', 'ㅒ': 'ㅐ', 'ㅖ': 'ㅔ'}
SIM_T = {'': 'ㄴㅇㄹ', 'ㄴ': 'ㅇㅁ', 'ㅇ': 'ㄴ', 'ㅁ': 'ㄴ', 'ㄹ': 'ㄴ', 'ㄱ': 'ㅋㄲ', 'ㅂ': 'ㅍ', 'ㅅ': 'ㅆㄷ', 'ㄷ': 'ㅅㅌ',
         'ㅆ': 'ㅅ', 'ㅈ': 'ㅊㅅ', 'ㅊ': 'ㅈ', 'ㅌ': 'ㄷ', 'ㅍ': 'ㅂ', 'ㅎ': 'ㅇ', 'ㄲ': 'ㄱ', 'ㅋ': 'ㄱ'}


def split(ch):
    i = ord(ch) - 0xAC00
    return L[i // 588], V[(i % 588) // 28], T[i % 28]


def join(l, v, t):
    return chr(0xAC00 + L.index(l) * 588 + V.index(v) * 28 + T.index(t))


def near_misses(word):
    out = set()
    for i, ch in enumerate(word):
        if not ('가' <= ch <= '힣'):
            continue
        l, v, t = split(ch)
        for l2 in SIM_L.get(l, ''):
            out.add(word[:i] + join(l2, v, t) + word[i + 1:])
        for v2 in SIM_V.get(v, ''):
            out.add(word[:i] + join(l, v2, t) + word[i + 1:])
        for t2 in [*SIM_T.get(t, '')] + ([''] if t else []):
            out.add(word[:i] + join(l, v, t2) + word[i + 1:])
    out.discard(word)
    return sorted(out)


def run(rec, items, rnd):
    gen, imp, pick, n = [], [], 0, 0
    for text, img in items:
        nm = near_misses(text)
        if len(nm) < 3:
            continue
        lp = rec.logprobs(img)
        got = rec.greedy(lp)
        own = rec.nll(lp, text)
        cands = rnd.sample(nm, 3)
        alt = [rec.nll(lp, c) for c in cands]
        if own is None or any(a is None for a in alt):
            continue
        n += 1
        pick += own < min(alt)
        gen.append(-1.0 if got == text else own / len(text))
        for c, a in zip(cands, alt):
            imp.append(-1.0 if got == c else a / len(c))
    gen, imp = np.array(gen), np.array(imp)
    out = {'n': n, 'pick_near': round(pick / max(1, n), 4)}
    for far in (0.01, 0.05):
        th = float(np.quantile(imp, far))
        out[f'verify_accept_at_far{int(far * 100)}'] = round(float(np.mean(gen < th)), 4)
    # the simplest rule: accept only when the greedy reading equals the expected word
    out['greedy_only_accept'] = round(float(np.mean(gen == -1.0)), 4)
    out['greedy_only_false_accept'] = round(float(np.mean(imp == -1.0)), 4)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', nargs='+', required=True)
    ap.add_argument('--strokes', required=True)
    ap.add_argument('--fonts', required=True)
    ap.add_argument('--vocab-words', required=True, help='text file, one learner word per line')
    ap.add_argument('--out', required=True)
    ap.add_argument('--words', type=int, default=1000)
    a = ap.parse_args()
    rnd = random.Random(11)
    df = pd.read_parquet(a.strokes, columns=['text', 'strokes'])
    words = []
    for r in df.sample(frac=1, random_state=2).itertuples():
        toks = r.text.split()
        parts = split_words(list(r.strokes), len(toks))
        if parts is None:
            continue
        for tok, st in zip(toks, parts):
            tok = ''.join(ch for ch in tok if '가' <= ch <= '힣')
            if not tok or not st or len(tok) > 6:
                continue
            img = render_strokes(st)
            if 0.55 <= img.width / img.height / len(tok) <= 1.6:
                words.append((tok, img))
        if len(words) >= a.words:
            break
    vocab = [w.strip() for w in open(a.vocab_words, encoding='utf-8') if w.strip()]
    fonts = sorted(Path(a.fonts).glob('*.ttf'))
    font_words = [(w, img) for f in fonts for w in vocab if (img := render_font(w, f)) is not None]
    report = {}
    for spec in a.models:
        name, paths = spec.split('=', 1)
        onnx_path, dict_path = paths.split(',')
        rec = Rec(onnx_path, dict_path)
        report[name] = {'real-words': run(rec, words, rnd), 'font-words': run(rec, font_words, rnd)}
        print(name, json.dumps(report[name], ensure_ascii=False), flush=True)
    Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
