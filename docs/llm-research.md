# Offline translator and assistant: research

Date: 2026-11-20. Measured on the build server (x86, 4 CPU threads, llama.cpp
and CTranslate2), **not on a phone**. Phone figures below are Google's published
numbers or marked as estimates.

## Test

- 12 sentences: 8 Korean → Russian, 4 Russian → Korean (everyday speech).
  Each scored 2 (right and natural), 1 (understandable, with errors) or 0 (meaning
  lost). Maximum 24.
- 5 grammar questions asked in Russian (은/는 vs 이/가, past tense, -아서/어서 vs
  -고, -요 vs -습니다, -(으)ㄹ 수 있다). Scored by whether the explanation is
  correct.
- Raw outputs: `docs/llm/*.json`; scripts: `labs/llm-research/`.
- Scores are mine. The set is small: it separates good from bad, not close
  candidates.

## Results

| Model | License | File | Translation | Grammar | Speed (server) | Peak RAM (server) |
|---|---|---|---|---|---|---|
| **Gemma 4 E2B** (Q4_K_M) | Apache 2.0 | 3.1 GB GGUF / **2.6 GB** LiteRT-LM | **23/24** | **4/5** (one wrong example, odd romanization) | 12.6 tok/s | 3.9 GB |
| Qwen3.5 4B (Q4_K_M) | Apache 2.0 | 2.7 GB | 21/24 | 0–1/5 (says 이/가 marks the object, 먹았다) | 6.3 tok/s | 5.0 GB |
| Qwen3.5 2B (Q4_K_M) | Apache 2.0 | 1.3 GB | 14/24 | 0/5 | 13.5 tok/s | 3.3 GB |
| Qwen3.5 0.8B (Q4_K_M) | Apache 2.0 | 0.5 GB | 10/24 | 0/5 (nonsense) | 29 tok/s | 2.0 GB |
| NLLB-200 600M (int8) | **CC BY-NC** | 0.6 GB | 16/24 ("зонт" → "наследство") | — | 0.4–0.9 s/sentence | 1.0 GB |
| M2M100 418M (int8) | MIT | 0.5 GB | 10/24 | — | 0.4–0.8 s | 0.8 GB |
| Opus-MT ko→ru | Apache 2.0 | 0.15 GB (fp16) | 10/16, ko→ru only | — | 0.1–0.3 s | 0.5 GB |
| Tencent HY-MT1.5 1.8B | **not usable** | 1.1 GB | not tested | — | — | — |

HY-MT1.5's license "does not apply in the European Union, United Kingdom and
South Korea": an app for learners of Korean cannot ship it.

Gemma 4 E2B on a phone (Google's LiteRT-LM model card, Galaxy S26 Ultra, 2048
context): 41–47 tok/s on CPU with 1.4–1.7 GB memory, 52 tok/s on GPU with 0.7–0.8
GB. Mid-range and older phones (Galaxy A55, Note 20 Ultra) are not published;
my estimate is 8–15 tok/s on CPU, to be measured.

## Conclusions

1. One model covers both: **Gemma 4 E2B** translated best (better than every
   dedicated translator tried) and was the only model whose grammar answers were
   mostly right. Smaller models make up grammar rules and must not be used for
   explanations.
2. Size: an optional download of about **2.6 GB**, for phones with 8 GB RAM or
   more. The speech model (~0.7 GB) should be unloaded while the assistant runs.
3. It still makes mistakes. Answers should be grounded in Namu's own data
   (dictionary entries, a curated grammar reference written for the app) put into
   the prompt, and marked as machine-generated.
4. Dedicated translators are smaller but worse; NLLB is non-commercial; Opus-MT
   has no direct Russian → Korean. A small translator is only worth adding for
   phones that cannot run Gemma.
5. Runtime: LiteRT-LM (Google's Android SDK for Gemma, Apache 2.0, CPU and GPU)
   or llama.cpp (MIT, GGUF, any model).

## Next step

A device test like the TTS lab: Gemma 4 E2B on the three test phones (speed,
memory, heat, first-token time, battery), the same 17 prompts plus a larger
grammar set, then a decision.
