import json, subprocess, sys, time, urllib.request, os
S = os.path.dirname(os.path.abspath(__file__))
SERVER = f'{S}/llama.cpp/build/bin/llama-server'
TR = [
 ('ko', 'ru', '저는 매일 아침 7시에 일어나서 운동을 해요.'),
 ('ko', 'ru', '이 근처에 지하철역이 어디에 있어요?'),
 ('ko', 'ru', '어제 친구랑 영화를 보러 갔는데 너무 재미있었어요.'),
 ('ko', 'ru', '한국어를 배운 지 일 년이 됐어요.'),
 ('ko', 'ru', '비가 와서 우산을 가져가야 해요.'),
 ('ko', 'ru', '이 음식은 맵지만 맛있어요.'),
 ('ko', 'ru', '시간이 있으면 같이 커피 마실래요?'),
 ('ko', 'ru', '회의가 끝나자마자 집에 갔어요.'),
 ('ru', 'ko', 'Я хочу выучить корейский, чтобы смотреть дорамы без субтитров.'),
 ('ru', 'ko', 'Сколько стоит этот билет?'),
 ('ru', 'ko', 'Вчера я очень устал, поэтому рано лёг спать.'),
 ('ru', 'ko', 'Можно мне меню, пожалуйста?'),
]
GR = [
 'Чем отличаются частицы 은/는 и 이/가 в корейском? Коротко, с двумя примерами.',
 'Как образуется прошедшее время глаголов в корейском? Покажи на 먹다 и 가다.',
 'Что значит окончание -아서/어서 и чем оно отличается от -고? Коротко, с примерами.',
 'Когда в корейском говорить с окончанием -요, а когда -습니다?',
 'Объясни конструкцию -(으)ㄹ 수 있다 и приведи два примера.',
]
LANG = {'ko': 'Korean', 'ru': 'Russian'}
SYS = 'Ты помощник в приложении для изучения корейского языка. Отвечай по-русски, кратко и точно. Корейские примеры пиши хангылем с переводом.'

def ask(messages, max_tokens):
    body = json.dumps({'messages': messages, 'max_tokens': max_tokens, 'temperature': 0.2, 'chat_template_kwargs': {'enable_thinking': False}}).encode()
    req = urllib.request.Request('http://127.0.0.1:8188/v1/chat/completions', body, {'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=900))
    return r['choices'][0]['message']['content'].strip(), r.get('timings', {})

def main(model, out):
    p = subprocess.Popen([SERVER, '-m', model, '--port', '8188', '-c', '4096', '-t', '4', '--jinja', '--no-webui'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(900):
            try:
                urllib.request.urlopen('http://127.0.0.1:8188/health', timeout=2)
                break
            except Exception:
                time.sleep(1)
        res = {'model': os.path.basename(model), 'size_mb': round(os.path.getsize(model) / 1e6), 'tr': [], 'gr': [], 'tps': []}
        for src, dst, text in TR:
            a, t = ask([{'role': 'user', 'content': f'Translate the following segment into {LANG[dst]}, without additional explanation.\n\n{text}'}], 200)
            res['tr'].append({'src': text, 'out': a}); res['tps'].append(t.get('predicted_per_second'))
        for q in GR:
            a, t = ask([{'role': 'system', 'content': SYS}, {'role': 'user', 'content': q}], 450)
            res['gr'].append({'q': q, 'out': a}); res['tps'].append(t.get('predicted_per_second'))
        with open(f'/proc/{p.pid}/status') as f:
            for line in f:
                if line.startswith('VmHWM'): res['peak_rss_mb'] = int(line.split()[1]) // 1024
        res['tps_median'] = sorted(x for x in res['tps'] if x)[len(res['tps']) // 2]
        json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
        print(res['model'], 'peak', res.get('peak_rss_mb'), 'MB, tok/s', round(res['tps_median'], 1))
    finally:
        p.terminate(); p.wait()

main(sys.argv[1], sys.argv[2])
