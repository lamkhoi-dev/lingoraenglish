/**
 * IPA symbol → TTS-readable pronunciation description.
 *
 * TTS engines (OpenAI Shimmer, etc.) do NOT understand raw IPA characters.
 * Sending "/e/" produces the letter-name "ee"; sending "ʊ" is undefined
 * behaviour. This map converts each IPA symbol to a short English phrase
 * that, when read by a native-accent TTS voice, produces the intended sound.
 *
 * Design rules:
 *  - The phrase must be pronounceable by an American-English TTS voice.
 *  - Prefer the keyword the phoneme is classically named after (e.g. "th" for
 *    /θ/), surrounded by words that isolate the sound.
 *  - For vowels, a single CVC word that unambiguously contains that vowel is
 *    enough (e.g. "bed" for /e/, "bit" for /ɪ/).
 *  - For consonants, use the consonant word at both start and end so the
 *    learner hears it in both positions.
 *  - Diphthongs: say the glide naturally inside a short word.
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

// ---------------------------------------------------------------------------
// The map
// Keys: bare IPA without slashes. Also include British/American variants.
// ---------------------------------------------------------------------------

const IPA_TTS_MAP: Record<string, string> = {
  // ── Short vowels ──────────────────────────────────────────────────────────
  /** /ɪ/  — short i */
  "ɪ": "ih",
  /** /e/  — short e */
  "e": "eh",
  /** /æ/  — short a */
  "æ": "aah",
  /** /ʌ/  — short u */
  "ʌ": "uh",
  /** /ɒ/  — British short o */
  "ɒ": "awh",
  /** /ɑ/  — American short o */
  "ɑ": "ah",
  /** /ʊ/  — short oo */
  "ʊ": "uuh",
  /** /ə/  — schwa */
  "ə": "uh",

  // ── Long vowels ───────────────────────────────────────────────────────────
  /** /iː/  — long ee */
  "iː": "ee",
  /** /ɑː/  — long ah */
  "ɑː": "aah",
  /** /ɔː/  — long aw */
  "ɔː": "aw",
  /** /uː/  — long oo */
  "uː": "oo",
  /** /ɜː/  — long er (British) */
  "ɜː": "er",
  /** /ɝ/   — r-coloured er (American) */
  "ɝ": "ur",

  // ── Diphthongs ────────────────────────────────────────────────────────────
  /** /eɪ/  — ay */
  "eɪ": "ay",
  /** /aɪ/  — eye */
  "aɪ": "eye",
  /** /ɔɪ/  — oy */
  "ɔɪ": "oy",
  /** /əʊ/  — British oh */
  "əʊ": "oh",
  /** /oʊ/  — American oh */
  "oʊ": "oh",
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
  "ʊə": "oor",
  /** /ʊr/  — American ure */
  "ʊr": "oor",

  // ── Plosives ──────────────────────────────────────────────────────────────
  /** /p/ — voiceless bilabial plosive */
  "p": "puh",
  /** /b/ — voiced bilabial plosive */
  "b": "buh",
  /** /t/ — voiceless alveolar plosive */
  "t": "tuh",
  /** /d/ — voiced alveolar plosive */
  "d": "duh",
  /** /k/ — voiceless velar plosive */
  "k": "kuh",
  /** /ɡ/ — voiced velar plosive */
  "ɡ": "guh",
  "g": "guh",

  // ── Fricatives ────────────────────────────────────────────────────────────
  /** /f/ — voiceless labiodental fricative */
  "f": "fff",
  /** /v/ — voiced labiodental fricative */
  "v": "vvv",
  /** /θ/ — voiceless dental fricative ("th") */
  "θ": "th",
  /** /ð/ — voiced dental fricative ("th") */
  "ð": "thuh",
  /** /s/ — voiceless alveolar fricative */
  "s": "sss",
  /** /z/ — voiced alveolar fricative */
  "z": "zzz",
  /** /ʃ/ — voiceless postalveolar fricative ("sh") */
  "ʃ": "shh",
  /** /ʒ/ — voiced postalveolar fricative ("zh") */
  "ʒ": "zhuh",
  /** /h/ — voiceless glottal fricative */
  "h": "huh",

  // ── Affricates ────────────────────────────────────────────────────────────
  /** /tʃ/ — voiceless postalveolar affricate ("ch") */
  "tʃ": "chuh",
  /** /dʒ/ — voiced postalveolar affricate ("j") */
  "dʒ": "juh",

  // ── Nasals ────────────────────────────────────────────────────────────────
  /** /m/ — bilabial nasal */
  "m": "mmm",
  /** /n/ — alveolar nasal */
  "n": "nnn",
  /** /ŋ/ — velar nasal ("ng") */
  "ŋ": "ung",

  // ── Approximants ──────────────────────────────────────────────────────────
  /** /l/ — lateral approximant */
  "l": "luh",
  /** /r/ — alveolar approximant [ɹ] */
  "r": "err",
  /** /j/ — palatal approximant ("y") */
  "j": "yuh",
  /** /w/ — labio-velar approximant */
  "w": "wuh",
};

