/**
 * Pronunciation curriculum for Lingora English.
 *
 * Everything here is written for speaking improvement: the 44 English phonemes
 * plus the delivery skills that actually make a learner sound natural (word
 * stress, sentence stress, intonation, connected speech, reductions, rhythm,
 * chunking and fluency).
 *
 * Accent policy: the phoneme inventory is the standard 44-sound set taught with
 * British RP. Where American English differs, `usSymbol` records the American
 * symbol so the UI can label each example honestly instead of mixing systems.
 */

export type PronLevel = "beginner" | "intermediate" | "advanced";
export type Difficulty = "easy" | "medium" | "hard";
export type Accent = "us" | "uk";

export type PhonemeGroup =
  | "short-vowel"
  | "long-vowel"
  | "diphthong"
  | "plosive"
  | "fricative"
  | "affricate"
  | "nasal"
  | "approximant";

export const PHONEME_GROUPS: { id: PhonemeGroup; label: string; family: string }[] = [
  { id: "short-vowel", label: "Short vowels", family: "Vowels" },
  { id: "long-vowel", label: "Long vowels", family: "Vowels" },
  { id: "diphthong", label: "Diphthongs", family: "Diphthongs" },
  { id: "plosive", label: "Plosives", family: "Consonants" },
  { id: "fricative", label: "Fricatives", family: "Consonants" },
  { id: "affricate", label: "Affricates", family: "Consonants" },
  { id: "nasal", label: "Nasals", family: "Consonants" },
  { id: "approximant", label: "Approximants", family: "Consonants" },
];

export type MinimalPairDrill = {
  contrast: string;
  a: string;
  b: string;
  note: string;
};

export type Phoneme = {
  /** Reference symbol (British RP inventory). */
  symbol: string;
  /** American symbol when it genuinely differs. */
  usSymbol?: string;
  name: string;
  group: PhonemeGroup;
  voiced: boolean;
  level: PronLevel;
  difficulty: Difficulty;
  /** Very short "how to make it" line. */
  how: string;
  lips: string;
  teeth: string;
  tongue: string;
  jaw: string;
  /** Typical mistakes, written with Vietnamese learners in mind. */
  mistakes: string[];
  words: string[];
  sentences: string[];
  pairs: MinimalPairDrill[];
  accentNote?: string;
};

/* ----------------------------- delivery skills ----------------------------- */

export type SkillId =
  | "sounds"
  | "word-stress"
  | "sentence-stress"
  | "intonation"
  | "connected-speech"
  | "reductions"
  | "rhythm"
  | "chunking"
  | "fluency";

export const SKILLS: { id: SkillId; label: string; icon: string; blurb: string }[] = [
  { id: "sounds", label: "Sounds", icon: "🔤", blurb: "All 44 English phonemes with minimal pairs." },
  { id: "word-stress", label: "Word stress", icon: "🗣️", blurb: "Syllables, primary and secondary stress." },
  { id: "sentence-stress", label: "Sentence stress", icon: "🎵", blurb: "Content words strong, function words weak." },
  { id: "intonation", label: "Intonation", icon: "📈", blurb: "Rising, falling, rise-fall and fall-rise." },
  { id: "connected-speech", label: "Connected speech", icon: "🔗", blurb: "Linking, elision, assimilation, weak forms." },
  { id: "reductions", label: "Reductions", icon: "💬", blurb: "gonna, wanna, hafta — informal spoken English." },
  { id: "rhythm", label: "Rhythm", icon: "🥁", blurb: "Stress-timed beats, timing and pauses." },
  { id: "chunking", label: "Pausing & chunking", icon: "⏸️", blurb: "Thought groups and natural breath pauses." },
  { id: "fluency", label: "Fluency", icon: "⚡", blurb: "Speed, hesitation, fillers and linking ideas." },
];

/* ------------------------------ practice flow ------------------------------ */

export const PRACTICE_STEPS = [
  { n: 1, label: "Listen", hint: "Play the model audio twice." },
  { n: 2, label: "Understand", hint: "Read what your mouth should do." },
  { n: 3, label: "Watch / learn", hint: "Check the mouth, tongue and pattern guide." },
  { n: 4, label: "Repeat", hint: "Say it out loud with the audio, slowly first." },
  { n: 5, label: "Record", hint: "Record yourself saying the same line." },
  { n: 6, label: "AI feedback", hint: "See what the coach heard and what to fix." },
  { n: 7, label: "Try again", hint: "Fix one thing and record once more." },
  { n: 8, label: "Mastered", hint: "Clear read-back twice in a row — move on." },
] as const;

/* --------------------------- measurable delivery --------------------------- */

const FILLER_PATTERNS = [
  "um",
  "uh",
  "erm",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "actually",
  "basically",
  "well",
];

export type DeliveryMetrics = {
  words: number;
  seconds: number;
  /** Words per minute across the whole recording. */
  wpm: number;
  pace: "slow" | "natural" | "fast";
  fillers: { word: string; count: number }[];
  fillerCount: number;
  repeatedWords: string[];
};

/**
 * Delivery numbers we can honestly measure from the real transcript plus the
 * real recording length. No acoustic analysis is invented here: pitch, loudness
 * and silent-pause detection are NOT included because we do not measure them.
 */
export function measureDelivery(transcript: string, seconds: number): DeliveryMetrics {
  const tokens = transcript
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const words = tokens.length;
  const safeSeconds = Math.max(1, Math.round(seconds));
  const wpm = Math.round((words / safeSeconds) * 60);

  const lower = ` ${tokens.join(" ")} `;
  const fillers = FILLER_PATTERNS.map((word) => ({
    word,
    count: (lower.match(new RegExp(`\\s${word.replace(/ /g, "\\s")}\\s`, "g")) ?? []).length,
  })).filter((f) => f.count > 0);

  const repeatedWords: string[] = [];
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1] && !repeatedWords.includes(tokens[i]!)) repeatedWords.push(tokens[i]!);
  }

  return {
    words,
    seconds: safeSeconds,
    wpm,
    pace: wpm < 100 ? "slow" : wpm > 175 ? "fast" : "natural",
    fillers,
    fillerCount: fillers.reduce((n, f) => n + f.count, 0),
    repeatedWords,
  };
}
