# Рукописный ввод: стенд для замеров

Проверяет, насколько хорошо открытые модели PP-OCRv5 Korean читают хангыль, нарисованный на экране, и насколько надёжно они могут **проверить** ожидаемый ответ. Результаты и выводы — в [docs/handwriting-research.md](../../docs/handwriting-research.md).

Код приложения не меняет. Данные и модели в репозиторий не входят.

## Что скачать

| Что | Откуда | Лицензия |
|---|---|---|
| `korean_PP-OCRv5_mobile_rec` в ONNX (`rec.onnx`, `dict.txt`) | huggingface.co/monkt/paddleocr-onnx, папка `languages/korean` | Apache-2.0 |
| `rec_korean_hw.onnx` + `ppocrv5_korean_dict.txt` | github.com/VerifiedIdiot/korean-handwriting-rec, папка `model` | Apache-2.0 (модель); обучена на данных AI Hub |
| Штрихи пера `recordings.parquet` | huggingface.co/datasets/jbaudanza/korean-handwriting-strokes | CC BY-SA 4.0 |
| Рукописные шрифты (10 шт.) | github.com/google/fonts, папка `ofl` | SIL OFL 1.1 |

Шрифты: Nanum Pen Script, Nanum Brush Script, Gaegu, Hi Melody, Gamja Flower, Poor Story, Single Day, Yeon Sung, Dokdo, East Sea Dokdo.

## Запуск

```sh
pip install onnxruntime numpy pandas pyarrow pillow
python3 eval.py \
  --models base=dl/ko_rec.onnx,dl/ko_dict.txt hw=dl/rec_korean_hw.onnx,dl/ppocrv5_korean_dict.txt \
  --strokes dl/recordings.parquet --fonts fonts --dict ../../assets/dict/krdict.db \
  --out out/report.json --lines 300 --words 1500 --vocab 150
```

## Как устроено

- Штрихи рисуются тонкой линией (≈2,6 px при высоте букв 40 px), как палец на экране, затем подаются в модель высотой 48 px. Так же будет работать приложение: штрихи → картинка → модель.
- Строки датасета режутся на слова по самым широким промежуткам между штрихами. Строки, где разрез неоднозначен, и куски, ширина которых не похожа на число слогов, отбрасываются.
- **exact / cer** — открытое распознавание: модель читает что угодно.
- **pick4** — правильное слово набирает лучший CTC-счёт среди себя и трёх других слов той же длины.
- **verify** — режим упражнения: «написано ли ожидаемое слово?». Принимаем, если жадная расшифровка совпала или CTC-потеря ожидаемого слова на символ ниже порога. Порог берётся так, чтобы неправильные слова проходили не чаще 1 % (или 5 %); отчёт показывает, какую долю правильно написанных слов мы при этом принимаем.
- Время — один поток CPU сервера; на телефоне ожидается в 2–4 раза дольше.
