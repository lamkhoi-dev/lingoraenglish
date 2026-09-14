# Lingora English with LiLy AI — roadmap

## Done
- Database schema + RLS + seed content; localisation tables (`ui_languages`, `ui_translations`, `vocabulary_translations`, `grammar_translations`) and profile localisation columns
- Design system (velvet jazz lounge tokens)
- AI provider abstraction (LLM / STT / TTS), cost limits + TTS cache
- Recorder hook, shared UI components, landing page, LiLy AI conversation, auth page
- Key-based i18n engine with English fallback, browser detection, RTL, Intl formatting, admin overrides
- Locale dictionaries for 16 launch languages
- Language selector (header + footer + landing + onboarding), key-based header/footer/landing/auth/lily-ai
- Multilingual onboarding (`/onboarding`): interface language, native language, level + target, goal, daily minutes

- Feature routes: speaking, pronunciation, vocabulary, grammar, listening, ielts, progress, account, admin
- Admin dashboard: students, content, AI usage, translation manager (per-locale overrides + missing report)

## In progress
- [ ] Today's practice completion tracking (mark plan tasks done)

## Remaining
- [ ] English Only Mode + "Explain in my language" applied to every AI feedback surface
- [ ] Localised meanings for seeded vocabulary/grammar in the top locales
- [ ] Speaking + conversation history detail views with audio playback
- [ ] hreflang + localised titles/descriptions per route (localised metadata beyond English source)
- [ ] Accessibility pass (keyboard, screen readers, non-colour status cues)

## Payments & subscriptions (done)
- Provider: built-in payments (merchant of record) — sandbox in preview, live after publish
- Plans in DB: Free, Premium ($9.99/mo, $79.99/yr), IELTS Pro ($19.99/mo, $159.99/yr), 7-day trial ON
- /pricing (monthly-yearly toggle, coupons, comparison, billing FAQ), /checkout/success (provider-verified), /checkout/cancelled
- /billing: plan, trial/renewal dates, usage meters, plan switch, cancel/keep, hosted portal, invoices
- Webhook: /api/public/payments/webhook (signature verified) → subscriptions + billing_events
- Server-side entitlements gate every AI capability (requireCapacity + recordUsage)
- Admin → Billing tab: MRR, subscription list, checkout funnel, complimentary access grant/revoke


## Speaking-first restructure (done)
- Navigation: Home, AI Speaking Coach, Shadowing, Listening Lab, Speaking Tests, Pronunciation, Speaking Vocabulary, My Progress.
- New routes: /ai-speaking (5 coach modes), /shadowing, /listening-lab, /speaking-tests (IELTS/TOEFL/PTE).
- Removed standalone /grammar, /listening, /ielts, /lily-ai, /correct, /speaking; grammar now lives inside speaking feedback.
- Pronunciation accepts ?sound= deep links from coach feedback; vocabulary has "Use it in speaking".
- Auth, billing/Paddle, quotas, entitlements, admin and database untouched.

## Pronunciation Coach rebuild (complete)
- All 44 English phonemes (RP reference + American variants) with level, difficulty, voicing, lips/teeth/tongue/jaw guidance, common learner mistakes, words, sentences, minimal pairs.
- Skill modules: word stress, sentence stress, intonation, connected speech, reductions, rhythm, pausing & chunking, fluency.
- Shared 8-step practice card (Listen -> Understand -> Watch -> Repeat -> Record -> AI feedback -> Try again -> Mastered) using real TTS, transcription and analysePronunciation.
- Honest metrics only: word accuracy from transcript, WPM/pace/fillers/repeats from real recording. No acoustic pitch/loudness/pause scoring (no provider).
- Progress from pronunciation_attempts/pronunciation_scores; filters for skill/level/difficulty/accent + search; ?sound= and ?skill= deep links from coach feedback and shadowing.

## Speaking Tests library (IELTS)
- Tables: `speaking_tests` (90 published sets: 30x Part 1, 30x Part 2 cue cards, 30x Part 3), `speaking_test_progress` (attempts, last/best band, completion).
- `speaking_test_catalogue()` gates content server-side: first 3 tests free, the rest require Premium (questions/cue content hidden when locked).
- Seeds in `scripts/seed/speaking-tests/*.json`, loaded via `scripts/load-speaking-tests.py` (upsert by slug).
- UI: `/speaking-tests` IELTS tab = filterable library (part, difficulty, access, status, topic search), test runner reusing existing recorder/transcription/`evaluateIelts`, full mock queue. TOEFL/PTE unchanged.
- My Progress shows a Speaking Tests panel (completed, average/best band, per-part counts, topics).

## Global language system (done)
- All hardcoded UI text in AI Speaking Coach, Shadowing, Listening Lab, Speaking Tests and shared pages moved into src/locales/en/*.ts section files merged into en.ts (1,186 keys).
- Every key translated into all 15 non-English locales via src/locales/sections/<code>.ts merged in src/locales/index.ts; all locales at 1,186/1,186.
- The learner's locale (`lang`) is passed into AI analysis/feedback calls; English learning content stays in English.
- Typecheck and build clean.

