# Namu — Calm Learning
Design specification v1. Proposed baseline for Android; validate on devices before merging.

## Identity
Namu (나무, tree) is a calm, adult-friendly offline Korean learning app. Botanical imagery is optional, restrained and meaningful; no forced gamification, gradients, glass effects, decorative dashboards or card around every row.

## Tokens
Dark: background #101713, surface #1B2620, primary #82C9A0, on-primary #101713, text #EAF0EB, secondary text #9BAEA2, selected surface #233D2D, border #34443A.
Light: background #F7F9F5, surface #FFFFFF, primary #276745, on-primary #FFFFFF, text #17241C, secondary #526459, selected #E1EFE4, border #CDD8CE.
Use semantic tokens for error, warning, success and information; verify WCAG AA contrast, never rely on color alone.
Typography: Inter for Latin/Cyrillic, Noto Sans KR for Hangul, with native fallback. Bundle fonts only after license and size review. Screen title 28sp, section 20sp, body 16sp, secondary 14sp, Korean exercise prompt 36–48sp. Respect system font scaling.
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
