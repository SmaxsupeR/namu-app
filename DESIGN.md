# Namu — Calm Learning
Design specification v1. Proposed baseline for Android; validate on devices before merging.

## Identity
Namu (나무, tree) is a calm, adult-friendly offline Korean learning app. Botanical imagery is optional, restrained and meaningful; no forced gamification, gradients, glass effects, decorative dashboards or card around every row.

## Tokens
Dark: background #101713, surface #1B2620, primary #82C9A0, on-primary #101713, text #EAF0EB, secondary text #9BAEA2, selected surface #233D2D, border #34443A.
Light: background #F7F9F5, surface #FFFFFF, primary #276745, on-primary #FFFFFF, text #17241C, secondary #526459, selected #E1EFE4, border #CDD8CE.
Use semantic tokens for error, warning, success and information; verify WCAG AA contrast, never rely on color alone.
Typography: Inter for Latin/Cyrillic (bundled, OFL, subset). Hangul is never rendered through the Inter fallback (its weight is lost there): Korean text uses a Korean font token — Android `sans-serif` (Noto Sans CJK KR), iOS Apple SD Gothic Neo, web Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic. Respect system font scaling (the main Korean word caps at 1.6× so it stays on screen).
Interface type: screen title 28sp, section 20sp, body 16sp, secondary 14sp, caption 13sp.
Study type (Hangul is the main accent of every exercise):
- Main Korean word `koreanPrompt` 56sp / line 72 / weight 600; long words scale by length 56→50→44→40→36sp (`koreanSize`); a phrase or sentence 28–36sp, line ≥1.3× (no clipped Hangul).
- Korean sentence (examples) `koreanSentence` 28sp / 40 / 500.
- Korean answer options and typed Korean `koreanOption` 26sp / 36 / 500 (input 28sp).
- Translation `translation` 26sp / 34 / Inter SemiBold; Russian answer options 18sp.
- Transcription `transcription` 15sp / 20.
- Task instruction `instruction` 19sp / 26 / Inter SemiBold.
- Listen button: 48dp circle under the word (does not push the word off centre).
- The task sits in the upper part of the screen at a steady position for every step; the answer action stays above the keyboard.
Spacing: 4/8/12/16/24/32dp; screen inset 16–20dp. Radius 12–16dp for surfaces, 12dp controls. Minimum interactive target 48dp. Prefer one consistent outline icon family (Lucide proposed; audit dependency before adding).
## Components
- Primary button: one dominant action per screen or current task; secondary actions as text or outline.
- List row: title, optional subtitle, trailing action; dividers instead of individual cards. Word row shows Hangul, translation, optional romanization, accessible mastery indicator and independent audio action.
- Search: short placeholder, clear action, filter icon; filters in accessible modal/bottom sheet with apply/reset.
- Settings row: label, current value, chevron or switch; group by purpose.
- Bottom navigation: Today, My words, Explore, Progress; labels always visible.
- Learning shell: close, progress, prompt, response, feedback, bottom action; keyboard and safe-area aware.
- Empty/error/loading states: explain next action, offer retry when appropriate. No fake statistics or decorative progress.
## Motion
Use subtle transitions and feedback, respect reduced-motion preferences. Avoid animation delaying study. Botanical illustrations must not compete with content.
## Validation
Check dark/light, Russian/English, long translations, Hangul, font scaling, small screens, TalkBack, keyboard, landscape where supported, safe areas and Android back. Preserve attribution and licenses.
