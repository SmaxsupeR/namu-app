import json, sys, time, resource, os
import ctranslate2, sentencepiece as spm
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
D = os.path.dirname(os.path.abspath(__file__)) + '/mt'
exec(open(os.path.dirname(os.path.abspath(__file__)) + '/eval.py').read().split('LANG =')[0].split('SERVER =')[1].split('\n', 1)[1])  # TR list
which = sys.argv[1]
out = []
t0 = time.time()
if which in ('nllb', 'm2m'):
    tr = ctranslate2.Translator(f'{D}/{which}', device='cpu', inter_threads=1, intra_threads=4)
    sp = spm.SentencePieceProcessor(model_file=f'{D}/{which}/sentencepiece.bpe.model')
    code = {'nllb': {'ko': 'kor_Hang', 'ru': 'rus_Cyrl'}, 'm2m': {'ko': '__ko__', 'ru': '__ru__'}}[which]
    for src, dst, text in TR:
        s = time.time()
        toks = [code[src]] + sp.encode(text, out_type=str) + ['</s>']
        r = tr.translate_batch([toks], target_prefix=[[code[dst]]], beam_size=4, max_decoding_length=200)
        hyp = sp.decode([t for t in r[0].hypotheses[0][1:]])
        out.append({'src': text, 'out': hyp, 'ms': round((time.time() - s) * 1000)})
else:
    tr = ctranslate2.Translator(f'{D}/opus-ko-ru', device='cpu', intra_threads=4)
    a = spm.SentencePieceProcessor(model_file=f'{D}/opus-ko-ru/source.spm')
    b = spm.SentencePieceProcessor(model_file=f'{D}/opus-ko-ru/target.spm')
    for src, dst, text in TR:
        if src != 'ko':
            continue
        s = time.time()
        r = tr.translate_batch([a.encode(text, out_type=str) + ['</s>']], beam_size=4)
        out.append({'src': text, 'out': b.decode(r[0].hypotheses[0]), 'ms': round((time.time() - s) * 1000)})
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024
json.dump({'model': which, 'peak_rss_mb': peak, 'tr': out}, open(f'{os.path.dirname(D)}/mt-{which}.json', 'w'), ensure_ascii=False, indent=1)
print('====', which, 'peak', peak, 'MB')
for o in out: print(f"  {o['ms']:5} ms  {o['src'][:38]} → {o['out']}")
