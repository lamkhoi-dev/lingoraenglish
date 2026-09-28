/**
 * IPA symbol → TTS-readable pronunciation description.
 *
 * TTS engines (OpenAI Shimmer, etc.) do NOT understand raw IPA characters.
 * Sending "/e/" produces the letter-name "ee"; sending "ʊ" is undefined
 * behaviour. This map converts each IPA symbol to a short English phrase
 * that, when read by a native-accent TTS voice, produces the intended sound.
 *
 * Design rules (revised 2026-09-26 — see project_pronunciation_audio_research
 * memory for the listening tests behind this):
 *  - The value MUST be a real, common, unambiguously-spelled English word,
 *    not a bare letter/IPA symbol and not a repeated-letter or onomatopoeia
 *    trick ("sss", "fff", "shh", "mmm", "err"...). Live listening tests
 *    confirmed Gemini TTS pronounces consonants correctly *inside a real
 *    word* (ship/she/shop/shore/shell, think/this/sing/milk all came out
 *    right) but reads an isolated/repeated-letter respelling wrong — the
 *    letter-doubling trick was the actual bug, not the sound or the voice.
 *  - Put the target sound in the position it naturally occurs in English:
 *    initial for most consonants ("she" for /ʃ/), medial for /ʒ/ ("measure"
 *    — English has ~no native initial /ʒ/ words), final for /ŋ/ ("sing" —
 *    it never starts a word). Don't force a word to contain the sound twice.
 *  - For vowels, a single CVC word that unambiguously contains that vowel is
 *    enough (e.g. "bed" for /e/, "bit" for /ɪ/).
 *  - Diphthongs: say the glide naturally inside a short word.
 *  - The single "shimmer" voice is American — it cannot produce a genuinely
 *    non-rhotic RP vowel (true /ɒ/, /ɜː/) no matter what word is chosen;
 *    those entries are the closest available anchor, not a perfect fix.
 *
 * When the TTS model reads this phrase, the learner hears a model
 * pronunciation they can copy. The text is also used as the TTS cache key,
 * so each symbol is generated only once regardless of which example word is
 * currently selected.
 */

/**
 * Returns a TTS-friendly string that represents the isolated IPA sound.
 * Falls back to the bare symbol (without slashes) if no mapping exists.
 *
 * @param ipaSymbol - e.g. "/e/", "/θ/", "/eɪ/", etc.
 */
export function ipaSoundPhrase(ipaSymbol: string): string {
  const bare = ipaSymbol.replaceAll("/", "").trim();
  return IPA_TTS_MAP[bare] ?? IPA_TTS_MAP[ipaSymbol] ?? bare;
}

/**
 * Build the full TTS script for a sound-focused Listen play.
 *
 * Gemini TTS is steered by natural-language prompts, not SSML/IPA tags.
 * The prompt instructs it to:
 *   1. Say the keyword word twice (briefly pausing between), emphasising
 *      the target sound so the learner hears it in a real English word.
 *   2. Say the example word once.
 *   3. Say the example sentence once (if provided).
 *
 * Each part is separated by " ... " so Gemini inserts a natural pause.
 */
export function buildSoundScript(
  ipaSymbol: string,
  exampleWord: string,
  exampleSentence?: string,
): string {
  const keyword = ipaSoundPhrase(ipaSymbol);
  // Build a clear, teacher-like script Gemini TTS can follow naturally.
  // Using comma-separated parts with ellipsis for natural pauses.
  const parts: string[] = [keyword, keyword, exampleWord];
  if (exampleSentence) parts.push(exampleSentence);
  // A plain ". " after a one-syllable non-word like "wuh" doesn't read as a
  // real sentence boundary to the model — it runs the parts together. "..."
  // is a stronger, unambiguous pause cue regardless of what precedes it.
  return parts.join(" ... ");
}

/**
 * Extra, never-spoken guidance (it sits before the transcript marker) for
 * the symbols Gemini still misreads from the bare symbol alone — reported
 * 2026-09-26 after live admin testing: /ð/ and /r/ wrong on every retry,
 * every other symbol correct. Deliberately limited to those two, so the
 * prompt for every symbol that already works stays byte-identical.
 *
 * /r/: in strict IPA, "r" is the rolled/trilled r; the English r is "ɹ" —
 * English dictionaries just write /r/ by convention. A model reading the
 * symbol as real IPA produces the trill, hence `symbol` overrides what's
 * put in the transcript (the cache key still uses /r/, see buildSoundScript).
 * /ð/: the example words anchor it to the voiced th, since it came out as
 * something else. No parentheses/brackets/# anywhere in these strings:
 * cleanTextForTts() (ai-providers.server.ts) strips them from all TTS text.
 */
const ISOLATED_SOUND_HINTS: Record<string, { symbol?: string; hint: string }> = {
  "ð": {
    hint:
      "This symbol is the voiced th sound heard at the start of the English " +
      "words this and that, said with the voice on. It is not a d sound, and " +
      "it is not the voiceless th of think.",
  },
  r: {
    symbol: "ɹ",
    hint:
      "This symbol is the English r sound heard at the start of red and run, " +
      "a smooth sound with the tongue not touching the roof of the mouth. It " +
      "is never a rolled or trilled r.",
  },
};

/**
 * Admin-only — a prompt that gets Gemini TTS to say the actual IPA symbol
 * ONCE, not a substitute word. Plain isolated symbols are misread, and
 * repeated-letter/spelled-out substitutes (the very bug 32 sounds were fixed
 * for) are unreliable — but a symbol wrapped in a short instruction, with a
 * "#### TRANSCRIPT" marker separating the instruction from what should
 * actually be spoken, is reliably correct in the technique's own source
 * material and was confirmed live in this project (2026-09-26): correct
 * audio 4 times out of 5, the 5th reading the instruction aloud instead.
 * That ~80% rate is only usable because an admin previews every take before
 * it's saved (see adminGenerateSoundTake) — never used on any path a
 * student can trigger unreviewed.
 *
 * Deliberately asks for the symbol ONCE, not twice: an earlier version
 * asked for it "twice in a row" in one generation, trusting the model to
 * actually say it twice — untested, and it didn't (came back as one
 * repetition, reported 2026-09-26). The "say it twice" requirement of
 * âm-âm-từ-câu is instead enforced in code, by concatenating this one
 * correct clip with itself (see adminGenerateSoundTake) — the model only
 * has to get the sound right once per generation, which is the one thing
 * actually validated live.
 */
export function buildIsolatedSoundPrompt(ipaSymbol: string): string {
  const extra = ISOLATED_SOUND_HINTS[ipaSymbol.replaceAll("/", "").trim()];
  const spokenSymbol = extra?.symbol ? `/${extra.symbol}/` : ipaSymbol;
  const instruction =
    "The text after the transcript marker is a single IPA phonetic symbol " +
    "from the standard International Phonetic Alphabet for English. Say " +
    "only the sound that symbol represents, clearly and naturally, exactly " +
    "as an English speaker would in a pronunciation lesson. Do not spell " +
    "out the symbol's name, and do not say anything else." +
    (extra ? ` ${extra.hint}` : "");
  // The technique this is based on uses a "#### TRANSCRIPT" marker, but
  // cleanTextForTts() (ai-providers.server.ts) strips every "#" from all TTS
  // text app-wide (it's there to remove stray markdown from LLM output) —
  // sending "####" through synthesise() would silently arrive at Gemini as
  // blank space, breaking the delimiter. "===" survives that cleaning and
  // reads the same way to the model; not itself live-tested against "####"
  // — if takes come out unreliable, that's the first thing to double-check
  // by pasting this exact output into AI Studio.
  return `${instruction}\n\n=== TRANSCRIPT ===\n\n${spokenSymbol}`;
}

// ---------------------------------------------------------------------------
// The map
// Keys: bare IPA without slashes. Also include British/American variants.
// ---------------------------------------------------------------------------

const IPA_TTS_MAP: Record<string, string> = {
  // ── Short vowels ──────────────────────────────────────────────────────────
  /** /ɪ/  — short i */
  "ɪ": "ih",
  /** /e/  — short e; not "bed" — that's this sound's own default example
   * word (pronunciation-sounds.server.ts), so "bed" here would collapse the
   * âm-âm-từ-câu script into "bed bed bed ..." instead of 4 distinct parts. */
  "e": "get",
  /** /æ/  — short a */
  "æ": "aah",
  /** /ʌ/  — short u */
  "ʌ": "uh",
  /** /ɒ/  — British short o */
  "ɒ": "on",
  /** /ɑ/  — American short o */
  "ɑ": "ah",
  /** /ʊ/  — short oo; not "book" (this sound's own default example word). */
  "ʊ": "push",
  /** /ə/  — schwa; not "about" (this sound's own default example word). */
  "ə": "sofa",

  // ── Long vowels ───────────────────────────────────────────────────────────
  /** /iː/  — long ee */
  "iː": "ee",
  /** /ɑː/  — long ah */
  "ɑː": "aah",
  /** /ɔː/  — long aw */
  "ɔː": "law",
  /** /uː/  — long oo */
  "uː": "oo",
  /** /ɜː/  — long er (British) */
  "ɜː": "her",
  /** /ɝ/   — r-coloured er (American); not "bird" — that's this sound's own
   * default example word (shared with /ɜː/, which is why /ɜː/ uses "her"
   * instead, a word not in that shared list, for the same reason). */
  "ɝ": "third",

  // ── Diphthongs ────────────────────────────────────────────────────────────
  /** /eɪ/  — ay; not "day" (this sound's own default example word). */
  "eɪ": "cake",
  /** /aɪ/  — eye */
  "aɪ": "eye",
  /** /ɔɪ/  — oy */
  "ɔɪ": "oy",
  /** /əʊ/  — British oh; not "go" (this sound's own default example word,
   * shared with /oʊ/ below). */
  "əʊ": "home",
  /** /oʊ/  — American oh; see /əʊ/ above. */
  "oʊ": "home",
  /** /aʊ/  — ow */
  "aʊ": "ow",
  /** /ɪə/  — British ear */
  "ɪə": "ear",
  /** /ɪr/  — American ear */
  "ɪr": "ear",
  /** /eə/  — British air */
  "eə": "air",
  /** /er/  — American air */
  "er": "air",
  /** /ʊə/  — British ure */
  "ʊə": "sure",
  /** /ʊr/  — American ure */
  "ʊr": "sure",

  // ── Plosives ──────────────────────────────────────────────────────────────
  /** /p/ — voiceless bilabial plosive; not "pen" (this sound's own default
   * example word). */
  "p": "park",
  /** /b/ — voiced bilabial plosive */
  "b": "buh",
  /** /t/ — voiceless alveolar plosive */
  "t": "top",
  /** /d/ — voiced alveolar plosive */
  "d": "duh",
  /** /k/ — voiceless velar plosive */
  "k": "kuh",
  /** /ɡ/ — voiced velar plosive */
  "ɡ": "guh",
  "g": "guh",

  // ── Fricatives ────────────────────────────────────────────────────────────
  // Every value below is deliberately NOT this sound's own default example
  // word (see pronunciation-sounds.server.ts PHONEMES[].words[0]) — using the
  // same word for both the "âm" (sound) slot and the "từ" (word) slot
  // collapses buildSoundScript's âm-âm-từ-câu script into "word word word
  // ..." instead of 4 distinct parts (reported 2026-09-26, e.g. /e/ was
  // "bed bed bed I go to bed at ten" instead of sound-sound-word-sentence).
  /** /f/ — voiceless labiodental fricative */
  "f": "fine",
  /** /v/ — voiced labiodental fricative */
  "v": "van",
  /** /θ/ — voiceless dental fricative ("th") */
  "θ": "thin",
  /** /ð/ — voiced dental fricative ("th") */
  "ð": "there",
  /** /s/ — voiceless alveolar fricative */
  "s": "sun",
  /** /z/ — voiced alveolar fricative */
  "z": "zip",
  /** /ʃ/ — voiceless postalveolar fricative ("sh") */
  "ʃ": "shoe",
  /** /ʒ/ — voiced postalveolar fricative ("zh"); English has almost no native
   * words starting with this sound, so — unlike the others — it's taught
   * medially, same as every ESL textbook does ("measure", "vision"). */
  "ʒ": "treasure",
  /** /h/ — voiceless glottal fricative */
  "h": "hat",

  // ── Affricates ────────────────────────────────────────────────────────────
  /** /tʃ/ — voiceless postalveolar affricate ("ch") */
  "tʃ": "cheese",
  /** /dʒ/ — voiced postalveolar affricate ("j") */
  "dʒ": "jump",

  // ── Nasals ────────────────────────────────────────────────────────────────
  /** /m/ — bilabial nasal */
  "m": "milk",
  /** /n/ — alveolar nasal */
  "n": "net",
  /** /ŋ/ — velar nasal ("ng"); never starts an English word, so — like /ʒ/ —
   * it's taught in final position, same as every ESL textbook does. */
  "ŋ": "king",

  // ── Approximants ──────────────────────────────────────────────────────────
  /** /l/ — lateral approximant */
  "l": "look",
  /** /r/ — alveolar approximant [ɹ]; was "err", which risks being read as the
   * interjection "err" (a different vowel) rather than the consonant. */
  "r": "run",
  /** /j/ — palatal approximant ("y") */
  "j": "yellow",
  /** /w/ — labio-velar approximant */
  "w": "win",
};

