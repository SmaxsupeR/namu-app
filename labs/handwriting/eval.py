"""Offline Hangul handwriting recognition: how well do open PP-OCRv5 Korean models read
handwriting drawn on a phone, and how well can they *check* an expected answer?

Inputs (downloaded separately, see README.md):
  --models   name=path/to/rec.onnx,path/to/dict.txt  (one or more)
  --strokes  recordings.parquet of jbaudanza/korean-handwriting-strokes (real pen strokes)
  --fonts    directory with Korean handwriting fonts (.ttf)
  --dict     Namu's krdict.db, for the learner vocabulary
Writes a JSON report.

Test sets
  real-lines  whole lines of real pen strokes (one writer)
  real-words  the same lines cut into words at the widest gaps between strokes
  font-words  learner words (levels 1-2) rendered in 10 handwriting fonts

Metrics
  exact     greedy CTC output equals the text (open recognition)
  cer       character error rate (open recognition)
  pick4     the true text scores best among itself and 3 other words of the same length
  verify    accept/reject "is this the expected word?": accept when the greedy output matches
            or the CTC loss of the expected word per character is under a threshold;
            reported as genuine-accept rate at the threshold where 1 % of wrong words pass
"""
import argparse
import json
import math
import random
import sqlite3
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

H = 48  # model input height


# ---------- rendering ----------

def render_strokes(strokes, height=40, pad=4, width_px=2.6):
    """Pen strokes → white image with dark ink, ink height `height` px (a finger-like line)."""
    xs = np.concatenate([s['x'] for s in strokes])
    ys = np.concatenate([s['y'] for s in strokes])
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    scale = height / max(1e-3, y1 - y0)
    w = int((x1 - x0) * scale) + 2 * pad + 1
    img = Image.new('L', (max(w, 8), height + 2 * pad + 1), 255)
    d = ImageDraw.Draw(img)
    for s in strokes:
        pts = [((x - x0) * scale + pad, (y - y0) * scale + pad) for x, y in zip(s['x'], s['y'])]
        if len(pts) == 1:
            x, y = pts[0]
            d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=0)
        else:
            d.line(pts, fill=0, width=int(round(width_px)), joint='curve')
    return img


def split_words(strokes, n_words, margin=1.6):
    """Cuts a line of strokes into n_words groups at the n-1 widest horizontal gaps (writing order).
    Returns None when the cut is not clear: the narrowest word gap must be `margin` times wider
    than the widest gap left inside words."""
    if n_words <= 1:
        return [strokes]
    right = -1e9
    gaps = []
    for i, s in enumerate(strokes):
        lo, hi = float(np.min(s['x'])), float(np.max(s['x']))
        if i > 0:
            gaps.append((lo - right, i))
        right = max(right, hi)
    ranked = sorted(gaps, reverse=True)
    if len(ranked) < n_words - 1:
        return None
    if len(ranked) >= n_words and ranked[n_words - 2][0] < margin * max(0.0, ranked[n_words - 1][0]):
        return None
    cuts = sorted(i for _, i in ranked[: n_words - 1])
    out, prev = [], 0
    for c in cuts + [len(strokes)]:
        out.append(strokes[prev:c])
        prev = c
    return out


def render_font(text, font, height=40, pad=4):
    f = ImageFont.truetype(str(font), 64)
    bbox = f.getbbox(text)
    img = Image.new('L', (bbox[2] - bbox[0] + 16, bbox[3] - bbox[1] + 16), 255)
    ImageDraw.Draw(img).text((8 - bbox[0], 8 - bbox[1]), text, font=f, fill=0)
    # crop to ink, then scale to the target ink height
    a = np.array(img)
    ys, xs = np.where(a < 128)
    if len(xs) == 0:
        return None
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = height / img.height
    img = img.resize((max(4, int(img.width * s)), height), Image.BILINEAR)
    out = Image.new('L', (img.width + 2 * pad, height + 2 * pad), 255)
    out.paste(img, (pad, pad))
    return out


# ---------- model ----------

class Rec:
    def __init__(self, onnx_path, dict_path):
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(onnx_path), so, providers=['CPUExecutionProvider'])
        self.inp = self.sess.get_inputs()[0].name
        chars = [l.rstrip('\n') for l in open(dict_path, encoding='utf-8')]
        self.chars = ['<blank>'] + chars + [' ']
        self.index = {c: i for i, c in enumerate(self.chars) if i > 0}

    def logprobs(self, img):
        w = min(1600, max(16, int(math.ceil(img.width * H / img.height))))
        x = np.asarray(img.convert('RGB').resize((w, H), Image.BILINEAR), dtype=np.float32) / 255.0
        x = (x - 0.5) / 0.5
        x = x.transpose(2, 0, 1)[None]
        p = self.sess.run(None, {self.inp: x})[0][0]  # [T, C], softmax
        if p.shape[1] != len(self.chars):
            raise SystemExit(f'dict size {len(self.chars)} does not match model output {p.shape[1]}')
        return np.log(np.clip(p, 1e-12, 1.0))

    def greedy(self, lp):
        best = lp.argmax(1)
        out, prev = [], 0
        for k in best:
            if k != prev and k != 0:
                out.append(self.chars[k])
            prev = k
        return ''.join(out).strip()

    def nll(self, lp, text):
        """CTC negative log-likelihood of `text` (None if a character is unknown)."""
        try:
            lab = [self.index[c] for c in text]
        except KeyError:
            return None
        ext = [0]
        for l in lab:
            ext += [l, 0]
        S, T = len(ext), lp.shape[0]
        if T < len(lab):
            return 1e9
        a = np.full(S, -np.inf)
        a[0] = lp[0, ext[0]]
        if S > 1:
            a[1] = lp[0, ext[1]]
        for t in range(1, T):
            prev = a
            a = np.full(S, -np.inf)
            for s in range(S):
                v = prev[s]
                if s >= 1:
                    v = np.logaddexp(v, prev[s - 1])
                if s >= 2 and ext[s] != 0 and ext[s] != ext[s - 2]:
                    v = np.logaddexp(v, prev[s - 2])
                a[s] = v + lp[t, ext[s]]
        tot = np.logaddexp(a[-1], a[-2]) if S > 1 else a[-1]
        return float(-tot)


def edit(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)]


# ---------- evaluation ----------

def evaluate(rec, items, vocab_by_len, rnd):
    """items: list of (text, image). Returns metrics."""
    n = exact = cer_e = cer_n = pick = pick_n = 0
    genuine, impostor, ms = [], [], []
    for text, img in items:
        t0 = time.perf_counter()
        lp = rec.logprobs(img)
        ms.append((time.perf_counter() - t0) * 1000)
        got = rec.greedy(lp)
        ref = text.strip()
        n += 1
        exact += got.replace(' ', '') == ref.replace(' ', '')
        cer_e += edit(got.replace(' ', ''), ref.replace(' ', ''))
        cer_n += len(ref.replace(' ', ''))
        others = [w for w in vocab_by_len.get(len(ref), []) if w != ref]
        if ' ' in ref or len(others) < 3 or len(ref) > 8:
            continue
        cands = rnd.sample(others, 3)
        own = rec.nll(lp, ref)
        alt = [rec.nll(lp, c) for c in cands]
        if own is None or any(a is None for a in alt):
            continue
        pick_n += 1
        pick += own < min(alt)
        # verification: score = NLL per char, greedy match always accepted
        genuine.append(-1.0 if got == ref else own / len(ref))
        for c, a in zip(cands, alt):
            impostor.append(-1.0 if got == c else a / len(c))
    out = {
        'n': n,
        'exact': round(exact / max(1, n), 4),
        'cer': round(cer_e / max(1, cer_n), 4),
        'ms_median': round(float(np.median(ms)), 1) if ms else None,
        'ms_p90': round(float(np.percentile(ms, 90)), 1) if ms else None,
    }
    if pick_n:
        out['pick4'] = round(pick / pick_n, 4)
        out['pick4_n'] = pick_n
        imp = np.array(impostor)
        gen = np.array(genuine)
        for far in (0.01, 0.05):
            th = float(np.quantile(imp, far))  # accept when score < th → at most `far` impostors pass
            out[f'verify_accept_at_far{int(far * 100)}'] = round(float(np.mean(gen < th)), 4)
            out[f'verify_threshold_far{int(far * 100)}'] = round(th, 3)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', nargs='+', required=True)
    ap.add_argument('--strokes', required=True)
    ap.add_argument('--fonts', required=True)
    ap.add_argument('--dict', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--lines', type=int, default=300)
    ap.add_argument('--words', type=int, default=1500)
    ap.add_argument('--vocab', type=int, default=150)
    a = ap.parse_args()
    rnd = random.Random(7)

    # learner vocabulary: beginner and intermediate single words
    db = sqlite3.connect(a.dict)
    vocab = sorted({w for (w,) in db.execute(
        "SELECT word FROM words WHERE level IN (1,2) AND unit='word' AND word GLOB '[가-힣]*' AND length(word) BETWEEN 1 AND 5")
        if all('가' <= ch <= '힣' for ch in w)})
    by_len = {}
    for w in vocab:
        by_len.setdefault(len(w), []).append(w)

    rec_df = pd.read_parquet(a.strokes, columns=['text', 'strokes'])
    rows = rec_df.sample(n=min(a.lines, len(rec_df)), random_state=1)
    lines = [(r.text, render_strokes(list(r.strokes))) for r in rows.itertuples()]
    words = []
    for r in rec_df.sample(frac=1, random_state=2).itertuples():
        toks = r.text.split()
        parts = split_words(list(r.strokes), len(toks))
        if parts is None:
            continue
        for tok, st in zip(toks, parts):
            tok = ''.join(ch for ch in tok if '가' <= ch <= '힣')
            if not tok or not st or len(tok) > 6:
                continue
            img = render_strokes(st)
            # a Hangul syllable is roughly as wide as it is tall: drop pieces that do not fit
            per = img.width / img.height / len(tok)
            if 0.55 <= per <= 1.6:
                words.append((tok, img))
        if len(words) >= a.words:
            break
    # add real words to the candidate pool so pick4 has same-length alternatives
    for t, _ in words:
        by_len.setdefault(len(t), [])
    fonts = sorted(Path(a.fonts).glob('*.ttf'))
    sample = rnd.sample(vocab, min(a.vocab, len(vocab)))
    font_words = [(w, img) for f in fonts for w in sample if (img := render_font(w, f)) is not None]
    per_font = {f.stem: [(w, img) for w in sample if (img := render_font(w, f)) is not None] for f in fonts}

    report = {'vocab_size': len(vocab), 'sets': {'real-lines': len(lines), 'real-words': len(words), 'font-words': len(font_words)}, 'models': {}}
    for spec in a.models:
        name, paths = spec.split('=', 1)
        onnx_path, dict_path = paths.split(',')
        rec = Rec(onnx_path, dict_path)
        m = {
            'size_mb': round(Path(onnx_path).stat().st_size / 1e6, 1),
            'real-lines': evaluate(rec, lines, {}, rnd),
            'real-words': evaluate(rec, words, by_len, rnd),
            'font-words': evaluate(rec, font_words, by_len, rnd),
            'per-font-exact': {k: evaluate(rec, v, {}, rnd)['exact'] for k, v in per_font.items()},
        }
        report['models'][name] = m
        print(name, json.dumps(m, ensure_ascii=False))
    Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=1))
    # a few samples for the report
    sd = Path(a.out).parent / 'samples'
    sd.mkdir(exist_ok=True)
    for i, (t, img) in enumerate(words[:6]):
        img.save(sd / f'real-word-{i}.png')
    for i, (t, img) in enumerate(font_words[:: max(1, len(font_words) // 6)][:6]):
        img.save(sd / f'font-word-{i}.png')


if __name__ == '__main__':
    main()
