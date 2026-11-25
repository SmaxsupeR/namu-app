# Namu UX v2
## Goal
Start studying without learning how the scheduler works. Preserve all existing capabilities and data; progressive disclosure, not feature deletion.

## Navigation
Today (index): daily study one tap, due grammar when applicable, recent dictionaries, compact daily progress, settings. Handle empty library, all done, loading and errors. Avoid duplicate metrics.
My words (dictionaries): collections, create, curated dictionary selection. Collection detail: study, compact search, filter sheet, compact word rows, add action. Overflow: edit, import/export, archive, duplicate, pause, delete as applicable. Destructive actions confirmed.
Explore: replace practice and translate tabs with a hub for free practice, listening, dictation, hard words, Korean dictionary, grammar, conjugation. Keep existing routes reachable; preserve deep links and back behavior. Experimental handwriting, if present in target source, explicitly marked experimental and not a default action.
Progress: mastered/learning/new counts, activity and forecast; accuracy and difficult words under details. Distinguish answers, words and cards. No fabricated goals or streaks.
Settings: appearance/language, learning, voice and downloads, data/backup, about/licenses. Advanced scheduler and diagnostics nested.

## Screen mapping
- src/app/(tabs)/_layout.tsx: four visible tabs; retain hidden legacy routes if needed.
- index.tsx: Today; dictionaries.tsx: My words; practice.tsx and translate.tsx: split hub and reference content without duplicating navigation; progress.tsx: summary and details.
- dictionary/[id].tsx: compact rows, search, filters, overflow, add and study.
- dictionary-edit.tsx: name first; optional description/color; management actions grouped.
- entry.tsx: Korean and translation required; dictionary suggestions contextual; additional meanings, transcription, example, tags, notes under optional details; preserve quick consecutive entry and duplicate warning.
- word/[id].tsx: word, pronunciation/audio, meanings and examples; add to collection opens selection; conjugation/related words secondary; preserve attribution.
- free.tsx: mode, source, count and Start; advanced settings collapsed. Preserve explicit selected words, today, hard words, directions, answer method, attempts and count-as-review eligibility.
- study.tsx: shared learning shell, separate introduction/recognition/recall/self-grade/audio states and summary. Preserve existing scoring, feedback, retry and scheduling behavior.
- grammar/[id].tsx: pattern, explanation, examples, practice CTA, related topics.
- grammar-drill.tsx: shared study shell; retain topic scoring and due reviews.
- conjugate.tsx: search/input and readable forms.
- import.tsx: input → preview → confirm, duplicate/error reporting.
- settings.tsx and licenses.tsx: grouped settings and accessible attribution.
- _layout.tsx: navigation, safe areas, loading/error handling.

## Training defaults
Use current valid settings for scheduled sessions. For free practice propose 20 words, all dictionaries, both directions, keyboard, three attempts; reuse last valid selection where appropriate. Mode-specific defaults must respect existing compatibility rules. Free practice does not change schedule by default; preserve explicit eligible opt-in. Never silently change FSRS settings. Do not claim a session is resumable unless implemented.
## Acceptance
Daily study starts in one tap from Today; listening starts within three taps with valid defaults and installed/available audio; search reachable within two taps; manual word entry only two required fields; filters in one panel; no mandatory advanced configuration. All legacy functions remain reachable. Verify empty/large dictionaries, duplicate imports, audio fallback, offline, keyboard, back, backup/restore and upgrades. Compare learning outcomes before/after using existing tests. Screenshots supplied by owner may be from a newer local build: reconcile differences before implementation.
## Delivery
1. Inventory current routes/components/settings and baseline tests.
2. Foundation and navigation.
3. Today, collections, entry.
4. Study and free practice.
5. Explore/reference/grammar.
6. Progress/settings.
7. Android regression and accessibility. Separate commits, review before merge.
