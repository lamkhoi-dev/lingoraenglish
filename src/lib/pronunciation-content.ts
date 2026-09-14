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

export const PHONEMES: Phoneme[] = [
  /* ------------------------------ short vowels ----------------------------- */
  {
    symbol: "/ɪ/",
    name: "short i",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Say a very short, relaxed 'i'. Do not smile and do not stretch it.",
    lips: "Relaxed, slightly apart — no smile.",
    teeth: "Teeth apart, no contact.",
    tongue: "High but pulled back towards the centre, loose.",
    jaw: "Almost closed, still.",
    mistakes: [
      "Stretching it into /iː/, so 'ship' becomes 'sheep'.",
      "Adding a smile, which lengthens the vowel.",
    ],
    words: ["ship", "sit", "bit", "live", "rich", "minute"],
    sentences: ["This little kid is sitting still.", "It is a big fish in a little dish."],
    pairs: [
      { contrast: "/ɪ/ vs /iː/", a: "ship", b: "sheep", note: "Short and loose vs long and smiling." },
      { contrast: "/ɪ/ vs /iː/", a: "live", b: "leave", note: "Length changes the meaning completely." },
      { contrast: "/ɪ/ vs /e/", a: "bit", b: "bet", note: "Tongue drops a little for /e/." },
    ],
  },
  {
    symbol: "/e/",
    name: "short e",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Mouth slightly open, say a crisp short 'e' as in 'bed'.",
    lips: "Neutral, spread a little.",
    teeth: "Comfortably apart.",
    tongue: "Mid-high and forward.",
    jaw: "Half closed.",
    mistakes: ["Opening too wide so 'bed' sounds like 'bad'.", "Adding a glide: 'bed' → 'beyd'."],
    words: ["bed", "ten", "head", "said", "friend", "many"],
    sentences: ["Ten red pens are on the desk.", "My best friend said yes."],
    pairs: [
      { contrast: "/e/ vs /æ/", a: "bed", b: "bad", note: "Drop the jaw further for /æ/." },
      { contrast: "/e/ vs /ɪ/", a: "pen", b: "pin", note: "Very common confusion — keep /e/ more open." },
    ],
  },
  {
    symbol: "/æ/",
    name: "short a",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Open wide and spread the lips, like a flat, bright 'a'.",
    lips: "Spread sideways.",
    teeth: "Wide apart.",
    tongue: "Low and forward.",
    jaw: "Clearly dropped.",
    mistakes: [
      "Using a Vietnamese 'e' so 'cat' sounds like 'ket'.",
      "Not opening the jaw, so 'bad' and 'bed' sound identical.",
    ],
    words: ["cat", "bad", "man", "happy", "answer", "travel"],
    sentences: ["That cat sat on a black mat.", "Sam has a bad habit."],
    pairs: [
      { contrast: "/æ/ vs /e/", a: "bad", b: "bed", note: "Wider mouth for /æ/." },
      { contrast: "/æ/ vs /ʌ/", a: "cat", b: "cut", note: "Wide and bright vs relaxed and central." },
    ],
  },
  {
    symbol: "/ʌ/",
    name: "short u",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Relax everything and make a short, punchy 'uh'.",
    lips: "Neutral, not rounded.",
    teeth: "Slightly apart.",
    tongue: "Central and low, completely relaxed.",
    jaw: "Half open.",
    mistakes: ["Rounding the lips so 'cut' sounds like 'cot'.", "Making it long — /ʌ/ is always short."],
    words: ["cut", "bus", "love", "much", "money", "brother"],
    sentences: ["My brother loves running.", "Just one cup of coffee."],
    pairs: [
      { contrast: "/ʌ/ vs /ɒ/", a: "cut", b: "cot", note: "No lip rounding on /ʌ/." },
      { contrast: "/ʌ/ vs /æ/", a: "cup", b: "cap", note: "Central vs wide and bright." },
    ],
  },
  {
    symbol: "/ɒ/",
    usSymbol: "/ɑ/",
    name: "short o",
    group: "short-vowel",
    voiced: true,
    level: "intermediate",
    difficulty: "hard",
    how: "Round the lips a little and say a short, open 'o'.",
    lips: "Lightly rounded.",
    teeth: "Well apart.",
    tongue: "Low and back.",
    jaw: "Open.",
    mistakes: [
      "Using the long /ɔː/ so 'not' sounds like 'naught'.",
      "Mixing accents: British 'hot' uses /ɒ/, American 'hot' uses /ɑ/.",
    ],
    words: ["hot", "not", "stop", "job", "watch", "possible"],
    sentences: ["The clock stopped on top of the box.", "It is not a hot job."],
    pairs: [
      { contrast: "/ɒ/ vs /ɔː/", a: "not", b: "nought", note: "Short vs long, same lip shape." },
      { contrast: "/ɒ/ vs /ʌ/", a: "cot", b: "cut", note: "Rounded vs neutral lips." },
    ],
    accentNote: "British English uses /ɒ/. American English usually uses an unrounded /ɑ/ in the same words.",
  },
  {
    symbol: "/ʊ/",
    name: "short oo",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Very short, loose 'u' with barely rounded lips.",
    lips: "Slightly rounded, relaxed.",
    teeth: "Close together.",
    tongue: "High-back but pulled towards the centre.",
    jaw: "Nearly closed.",
    mistakes: ["Stretching it into /uː/, so 'full' becomes 'fool'.", "Rounding the lips too tightly."],
    words: ["book", "good", "put", "full", "could", "woman"],
    sentences: ["Put the good book down.", "She could not look."],
    pairs: [
      { contrast: "/ʊ/ vs /uː/", a: "full", b: "fool", note: "Short and loose vs long and tight." },
      { contrast: "/ʊ/ vs /ʌ/", a: "look", b: "luck", note: "Rounded vs neutral." },
    ],
  },
  {
    symbol: "/ə/",
    name: "schwa",
    group: "short-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "The laziest English sound: relax completely and say a tiny 'uh'.",
    lips: "Fully relaxed, barely open.",
    teeth: "Slightly apart.",
    tongue: "Resting in the middle of the mouth.",
    jaw: "Almost closed and still.",
    mistakes: [
      "Pronouncing every letter fully, so 'banana' becomes 'ba-na-na' instead of /bəˈnɑːnə/.",
      "Stressing a schwa syllable — schwa is never stressed.",
    ],
    words: ["about", "teacher", "banana", "support", "police", "problem"],
    sentences: ["A banana for the teacher.", "The police support the doctor."],
    pairs: [
      { contrast: "/ə/ vs /ʌ/", a: "aBOUT", b: "but", note: "Schwa is unstressed; /ʌ/ carries stress." },
      { contrast: "/ə/ vs /ɜː/", a: "forWARD", b: "word", note: "Schwa is short, /ɜː/ is long and stressed." },
    ],
  },

  /* ------------------------------ long vowels ------------------------------ */
  {
    symbol: "/iː/",
    name: "long ee",
    group: "long-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Smile and hold a long 'ee'.",
    lips: "Spread wide, almost smiling.",
    teeth: "Close together.",
    tongue: "High and far forward.",
    jaw: "Nearly closed.",
    mistakes: ["Cutting it short so 'sheep' becomes 'ship'.", "Forgetting the smile, which shortens the sound."],
    words: ["sheep", "seat", "leave", "green", "people", "believe"],
    sentences: ["She needs a clean sheet of paper.", "Three green trees."],
    pairs: [
      { contrast: "/iː/ vs /ɪ/", a: "seat", b: "sit", note: "Long and smiling vs short and loose." },
      { contrast: "/iː/ vs /ɪ/", a: "feel", b: "fill", note: "Hold the vowel twice as long." },
    ],
  },
  {
    symbol: "/ɑː/",
    name: "long ah",
    group: "long-vowel",
    voiced: true,
    level: "intermediate",
    difficulty: "medium",
    how: "Open your mouth like at the dentist and hold a long 'ah'.",
    lips: "Neutral, not rounded.",
    teeth: "Wide apart.",
    tongue: "Low and back.",
    jaw: "Fully dropped.",
    mistakes: ["Making it short like /ʌ/.", "Adding an /r/ in British English words such as 'car'."],
    words: ["car", "far", "father", "start", "heart", "calm"],
    sentences: ["Father parked the car far away.", "Start the car after dark."],
    pairs: [
      { contrast: "/ɑː/ vs /ʌ/", a: "cart", b: "cut", note: "Long and open vs short and central." },
      { contrast: "/ɑː/ vs /æ/", a: "calm", b: "cam", note: "Back and long vs front and bright." },
    ],
    accentNote: "In American English the /r/ in 'car' and 'start' is pronounced; in British RP it is silent.",
  },
  {
    symbol: "/ɔː/",
    name: "long aw",
    group: "long-vowel",
    voiced: true,
    level: "intermediate",
    difficulty: "medium",
    how: "Round the lips and hold a long 'aw'.",
    lips: "Clearly rounded and pushed forward.",
    teeth: "Fairly apart.",
    tongue: "Low and back.",
    jaw: "Open.",
    mistakes: ["Shortening it to /ɒ/.", "Losing the lip rounding halfway through."],
    words: ["thought", "law", "caught", "door", "before", "always"],
    sentences: ["He bought a tall door.", "I always thought so."],
    pairs: [
      { contrast: "/ɔː/ vs /ɒ/", a: "caught", b: "cot", note: "Long vs short." },
      { contrast: "/ɔː/ vs /əʊ/", a: "law", b: "low", note: "Steady vowel vs gliding diphthong." },
    ],
  },
  {
    symbol: "/uː/",
    name: "long oo",
    group: "long-vowel",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Push the lips forward into a small circle and hold 'oo'.",
    lips: "Tightly rounded, pushed forward.",
    teeth: "Close together.",
    tongue: "High and back.",
    jaw: "Nearly closed.",
    mistakes: ["Cutting it short so 'fool' becomes 'full'.", "Not rounding the lips enough."],
    words: ["food", "blue", "true", "school", "choose", "usually"],
    sentences: ["Two blue shoes.", "Who chose the new food?"],
    pairs: [
      { contrast: "/uː/ vs /ʊ/", a: "fool", b: "full", note: "Long and tight vs short and loose." },
      { contrast: "/uː/ vs /juː/", a: "food", b: "feud", note: "Some words add a /j/ glide first." },
    ],
  },
  {
    symbol: "/ɜː/",
    usSymbol: "/ɝ/",
    name: "long er",
    group: "long-vowel",
    voiced: true,
    level: "intermediate",
    difficulty: "hard",
    how: "Hold a long, neutral 'er' with the tongue slightly curled.",
    lips: "Slightly rounded, jaw mid.",
    teeth: "Apart.",
    tongue: "Central; the tip curls a little back without touching anything.",
    jaw: "Mid open.",
    mistakes: [
      "Replacing it with a Vietnamese 'ơ' that is too short.",
      "Dropping the r-colour in American English words such as 'work'.",
    ],
    words: ["bird", "work", "learn", "nurse", "first", "person"],
    sentences: ["The nurse learned first.", "Her first word was perfect."],
    pairs: [
      { contrast: "/ɜː/ vs /ə/", a: "bird", b: "about", note: "Long and stressed vs short and unstressed." },
      { contrast: "/ɜː/ vs /ɔː/", a: "were", b: "war", note: "Neutral vs rounded." },
    ],
    accentNote: "American English keeps a strong r-colour (/ɝ/); British RP has no audible r at the end.",
  },

  /* ------------------------------- diphthongs ------------------------------ */
  {
    symbol: "/eɪ/",
    name: "ay diphthong",
    group: "diphthong",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Start at /e/ and glide up into /ɪ/ — one smooth movement.",
    lips: "Start neutral, finish spread.",
    teeth: "Apart, closing slightly.",
    tongue: "Moves from mid-front up to high-front.",
    jaw: "Half open, then closing.",
    mistakes: ["Saying a flat /e/ with no glide, so 'late' sounds like 'let'.", "Splitting it into two syllables."],
    words: ["day", "make", "rain", "eight", "later", "afraid"],
    sentences: ["They came late today.", "Wait — it may rain."],
    pairs: [
      { contrast: "/eɪ/ vs /e/", a: "late", b: "let", note: "Glide up for /eɪ/." },
      { contrast: "/eɪ/ vs /aɪ/", a: "pain", b: "pine", note: "Start position changes." },
    ],
  },
  {
    symbol: "/aɪ/",
    name: "eye diphthong",
    group: "diphthong",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Open wide, then glide up towards a smile.",
    lips: "Open, then spreading.",
    teeth: "Wide, then closing.",
    tongue: "Low-front gliding to high-front.",
    jaw: "Dropped, then closing.",
    mistakes: ["Cutting the glide short.", "Making it two separate syllables."],
    words: ["time", "my", "five", "night", "decide", "quiet"],
    sentences: ["Five nights of my life.", "I like this quiet time."],
    pairs: [
      { contrast: "/aɪ/ vs /ɔɪ/", a: "file", b: "foil", note: "Start unrounded vs rounded." },
      { contrast: "/aɪ/ vs /eɪ/", a: "might", b: "mate", note: "Wide start vs mid start." },
    ],
  },
  {
    symbol: "/ɔɪ/",
    name: "oy diphthong",
    group: "diphthong",
    voiced: true,
    level: "intermediate",
    difficulty: "easy",
    how: "Start with rounded 'aw', then glide to 'ee'.",
    lips: "Rounded, then spreading.",
    teeth: "Apart, then closing.",
    tongue: "Back-low gliding to front-high.",
    jaw: "Open, then closing.",
    mistakes: ["Losing the rounded start.", "Stopping halfway so 'boy' sounds like 'baw'."],
    words: ["boy", "noise", "choice", "enjoy", "point", "avoid"],
    sentences: ["The boys enjoy the noise.", "Avoid that choice."],
    pairs: [
      { contrast: "/ɔɪ/ vs /aɪ/", a: "boil", b: "bile", note: "Rounded vs unrounded start." },
      { contrast: "/ɔɪ/ vs /ɔː/", a: "coin", b: "corn", note: "Glide vs steady vowel." },
    ],
  },
  {
    symbol: "/əʊ/",
    usSymbol: "/oʊ/",
    name: "oh diphthong",
    group: "diphthong",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Start neutral and round the lips as you finish.",
    lips: "Neutral, then rounded.",
    teeth: "Apart, then closing.",
    tongue: "Central gliding back and up.",
    jaw: "Mid, then closing.",
    mistakes: [
      "Saying a flat Vietnamese 'ô' with no glide.",
      "Mixing accents — British starts with /ə/, American starts with /o/.",
    ],
    words: ["go", "boat", "know", "phone", "hope", "although"],
    sentences: ["I know the old road home.", "Don't go alone."],
    pairs: [
      { contrast: "/əʊ/ vs /ɔː/", a: "coat", b: "caught", note: "Glide vs steady." },
      { contrast: "/əʊ/ vs /ʌ/", a: "boat", b: "but", note: "Long glide vs short punch." },
    ],
    accentNote: "British RP writes this /əʊ/, American English /oʊ/ — the American start is more rounded.",
  },
  {
    symbol: "/aʊ/",
    name: "ow diphthong",
    group: "diphthong",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Open wide, then round the lips as you glide to 'oo'.",
    lips: "Open, then rounded.",
    teeth: "Wide, then closing.",
    tongue: "Low-front gliding high-back.",
    jaw: "Dropped, then closing.",
    mistakes: ["Not rounding at the end.", "Making it too short."],
    words: ["now", "house", "around", "loud", "down", "about"],
    sentences: ["How about now?", "The loud crowd went downtown."],
    pairs: [
      { contrast: "/aʊ/ vs /əʊ/", a: "town", b: "tone", note: "Wide start vs neutral start." },
      { contrast: "/aʊ/ vs /ɑː/", a: "loud", b: "lard", note: "Glide vs steady." },
    ],
  },
  {
    symbol: "/ɪə/",
    usSymbol: "/ɪr/",
    name: "ear diphthong",
    group: "diphthong",
    voiced: true,
    level: "intermediate",
    difficulty: "medium",
    how: "Say /ɪ/ and relax into a schwa.",
    lips: "Relaxed throughout.",
    teeth: "Slightly apart.",
    tongue: "High-front sliding to centre.",
    jaw: "Nearly closed, opening slightly.",
    mistakes: ["Making one flat vowel.", "Adding a hard /r/ in British English."],
    words: ["here", "near", "clear", "really", "idea", "career"],
    sentences: ["Come here — it is clear and near.", "That idea is really clear."],
    pairs: [
      { contrast: "/ɪə/ vs /iː/", a: "beer", b: "bee", note: "Glide to schwa vs steady long vowel." },
      { contrast: "/ɪə/ vs /eə/", a: "beer", b: "bear", note: "Start high vs start mid." },
    ],
    accentNote: "American English pronounces the r: 'here' /hɪr/. British RP glides into a schwa instead.",
  },
  {
    symbol: "/eə/",
    usSymbol: "/er/",
    name: "air diphthong",
    group: "diphthong",
    voiced: true,
    level: "intermediate",
    difficulty: "medium",
    how: "Say /e/ and relax into a schwa.",
    lips: "Neutral.",
    teeth: "Apart.",
    tongue: "Mid-front sliding to centre.",
    jaw: "Half open.",
    mistakes: ["Using /iː/ instead of /e/ at the start.", "Cutting the schwa off."],
    words: ["air", "care", "where", "hair", "compare", "prepare"],
    sentences: ["Where is the fair hair care?", "Prepare and compare."],
    pairs: [
      { contrast: "/eə/ vs /ɪə/", a: "bear", b: "beer", note: "Mid start vs high start." },
      { contrast: "/eə/ vs /e/", a: "share", b: "shed", note: "Glide vs short vowel." },
    ],
    accentNote: "American English pronounces the r: 'care' /ker/.",
  },
  {
    symbol: "/ʊə/",
    usSymbol: "/ʊr/",
    name: "ure diphthong",
    group: "diphthong",
    voiced: true,
    level: "advanced",
    difficulty: "hard",
    how: "Say /ʊ/ and relax into a schwa.",
    lips: "Lightly rounded, then relaxing.",
    teeth: "Close, opening slightly.",
    tongue: "High-back sliding to centre.",
    jaw: "Nearly closed.",
    mistakes: ["Replacing it with /ɔː/ (common even for natives in 'sure').", "Losing the rounded start."],
    words: ["tour", "poor", "sure", "cure", "pure", "mature"],
    sentences: ["Are you sure about the tour?", "A pure cure for the poor."],
    pairs: [
      { contrast: "/ʊə/ vs /ɔː/", a: "poor", b: "pour", note: "Many speakers merge these — practise both." },
      { contrast: "/ʊə/ vs /uː/", a: "tour", b: "too", note: "Glide vs steady long vowel." },
    ],
    accentNote: "Both British and American speakers often replace /ʊə/ with /ɔː/ or /ʊr/ — say which one you are copying.",
  },

  /* -------------------------------- plosives ------------------------------- */
  {
    symbol: "/p/",
    name: "p",
    group: "plosive",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Close both lips, build air, then release a small puff — no voice.",
    lips: "Pressed together, then released.",
    teeth: "Not involved.",
    tongue: "Neutral.",
    jaw: "Closed, then opening.",
    mistakes: [
      "No puff of air at the start of a word: 'pen' sounds like 'ben'.",
      "Dropping the final /p/ in 'stop' or 'help'.",
    ],
    words: ["pen", "happy", "stop", "people", "apple", "help"],
    sentences: ["Peter put the paper in his pocket.", "Please stop pushing."],
    pairs: [
      { contrast: "/p/ vs /b/", a: "pen", b: "Ben", note: "Voiceless with a puff vs voiced." },
      { contrast: "/p/ vs /f/", a: "pan", b: "fan", note: "Full lip closure vs teeth on lip." },
    ],
  },
  {
    symbol: "/b/",
    name: "b",
    group: "plosive",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Same as /p/ but with the voice buzzing and no strong puff.",
    lips: "Pressed together, then released.",
    teeth: "Not involved.",
    tongue: "Neutral.",
    jaw: "Closed, then opening.",
    mistakes: ["Dropping the final /b/ in 'job' or 'club'.", "Devoicing it so 'big' sounds like 'pig'."],
    words: ["big", "baby", "job", "about", "club", "problem"],
    sentences: ["The baby is a bit busy.", "Bob booked a big cab."],
    pairs: [
      { contrast: "/b/ vs /p/", a: "bat", b: "pat", note: "Voiced vs voiceless." },
      { contrast: "/b/ vs /v/", a: "berry", b: "very", note: "Lips together vs teeth on lip." },
    ],
  },
  {
    symbol: "/t/",
    name: "t",
    group: "plosive",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Tongue tip taps the ridge behind the top teeth, release air — no voice.",
    lips: "Relaxed.",
    teeth: "Slightly apart.",
    tongue: "Tip on the ridge behind the upper teeth.",
    jaw: "Nearly closed.",
    mistakes: [
      "Leaving the final /t/ out: 'want' → 'wan'.",
      "Using a Vietnamese unreleased /t/ at the end of every word.",
    ],
    words: ["time", "water", "want", "sit", "better", "important"],
    sentences: ["Take the time to talk to Tom.", "It is important to try."],
    pairs: [
      { contrast: "/t/ vs /d/", a: "time", b: "dime", note: "Voiceless vs voiced." },
      { contrast: "/t/ vs /θ/", a: "tin", b: "thin", note: "Tongue on ridge vs between teeth." },
    ],
    accentNote: "American English often taps /t/ between vowels: 'water' sounds close to 'wader'.",
  },
  {
    symbol: "/d/",
    name: "d",
    group: "plosive",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Same place as /t/ but with the voice on.",
    lips: "Relaxed.",
    teeth: "Slightly apart.",
    tongue: "Tip on the ridge behind the upper teeth.",
    jaw: "Nearly closed.",
    mistakes: ["Dropping the final /d/ in 'need' or 'good'.", "Turning /d/ into /t/ at the end of words."],
    words: ["day", "did", "need", "good", "under", "decided"],
    sentences: ["Dad did it during the day.", "I decided I needed a doctor."],
    pairs: [
      { contrast: "/d/ vs /t/", a: "bed", b: "bet", note: "Voiced vs voiceless ending." },
      { contrast: "/d/ vs /ð/", a: "dare", b: "there", note: "Ridge stop vs soft buzz between teeth." },
    ],
  },
  {
    symbol: "/k/",
    name: "k",
    group: "plosive",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Back of the tongue blocks the throat, then release a puff — no voice.",
    lips: "Relaxed.",
    teeth: "Apart.",
    tongue: "Back rises to the soft palate.",
    jaw: "Half open.",
    mistakes: ["No release at the end: 'book' loses its /k/.", "Swapping with /ɡ/."],
    words: ["cat", "school", "book", "quick", "because", "market"],
    sentences: ["Can you keep the key?", "I took a quick look at the book."],
    pairs: [
      { contrast: "/k/ vs /ɡ/", a: "coat", b: "goat", note: "Voiceless vs voiced." },
      { contrast: "/k/ vs /h/", a: "cat", b: "hat", note: "Full stop vs free airflow." },
    ],
  },
  {
    symbol: "/ɡ/",
    name: "g",
    group: "plosive",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Same as /k/ with the voice buzzing.",
    lips: "Relaxed.",
    teeth: "Apart.",
    tongue: "Back against the soft palate.",
    jaw: "Half open.",
    mistakes: ["Devoicing so 'bag' sounds like 'back'.", "Adding an extra vowel: 'big' → 'bi-gə'."],
    words: ["go", "big", "again", "bag", "forget", "language"],
    sentences: ["The girl got a big bag.", "Let's go again."],
    pairs: [
      { contrast: "/ɡ/ vs /k/", a: "bag", b: "back", note: "Keep the voice on for /ɡ/." },
      { contrast: "/ɡ/ vs /dʒ/", a: "gay", b: "jay", note: "Back stop vs front affricate." },
    ],
  },

  /* ------------------------------- fricatives ------------------------------ */
  {
    symbol: "/f/",
    name: "f",
    group: "fricative",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Top teeth touch the lower lip and blow steadily — no voice.",
    lips: "Lower lip under the upper teeth.",
    teeth: "Upper teeth on the lip.",
    tongue: "Not involved.",
    jaw: "Nearly closed.",
    mistakes: ["Using /p/ instead of /f/.", "Dropping the final /f/ in 'life'."],
    words: ["fun", "coffee", "life", "before", "different", "enough"],
    sentences: ["Find four fresh coffees.", "Life is different for my family."],
    pairs: [
      { contrast: "/f/ vs /v/", a: "fan", b: "van", note: "Voiceless vs voiced, same position." },
      { contrast: "/f/ vs /p/", a: "fine", b: "pine", note: "Continuous air vs sudden release." },
    ],
  },
  {
    symbol: "/v/",
    name: "v",
    group: "fricative",
    voiced: true,
    level: "beginner",
    difficulty: "hard",
    how: "Same as /f/ but let the voice buzz through.",
    lips: "Lower lip under the upper teeth.",
    teeth: "Upper teeth on the lip.",
    tongue: "Not involved.",
    jaw: "Nearly closed.",
    mistakes: [
      "Using a Vietnamese 'v' made with both lips, which sounds like /b/ or /w/.",
      "Devoicing so 'have' sounds like 'half'.",
    ],
    words: ["very", "love", "believe", "voice", "over", "seven"],
    sentences: ["Very lovely voice.", "I believe I have seven."],
    pairs: [
      { contrast: "/v/ vs /b/", a: "very", b: "berry", note: "Teeth on lip vs lips together." },
      { contrast: "/v/ vs /w/", a: "vine", b: "wine", note: "Teeth contact vs rounded lips only." },
    ],
  },
  {
    symbol: "/θ/",
    name: "voiceless th",
    group: "fricative",
    voiced: false,
    level: "intermediate",
    difficulty: "hard",
    how: "Tongue tip lightly between the teeth, blow air — no voice.",
    lips: "Relaxed and open.",
    teeth: "Lightly holding the tongue tip.",
    tongue: "Tip just between or touching the upper teeth.",
    jaw: "Slightly open.",
    mistakes: [
      "Replacing it with /t/: 'think' → 'tink'.",
      "Replacing it with /s/: 'think' → 'sink'.",
      "Hiding the tongue behind the teeth.",
    ],
    words: ["think", "three", "thank", "mouth", "healthy", "something"],
    sentences: ["I think three things.", "Thank you for the healthy month."],
    pairs: [
      { contrast: "/θ/ vs /t/", a: "think", b: "tink", note: "Tongue between teeth vs on the ridge." },
      { contrast: "/θ/ vs /s/", a: "think", b: "sink", note: "Air over the tongue tip vs a sharp hiss." },
      { contrast: "/θ/ vs /f/", a: "three", b: "free", note: "Tongue vs lip." },
    ],
  },
  {
    symbol: "/ð/",
    name: "voiced th",
    group: "fricative",
    voiced: true,
    level: "intermediate",
    difficulty: "hard",
    how: "Same position as /θ/, but buzz with your voice.",
    lips: "Relaxed.",
    teeth: "Lightly on the tongue tip.",
    tongue: "Tip between the teeth, vibrating.",
    jaw: "Slightly open.",
    mistakes: ["Replacing it with /d/: 'this' → 'dis'.", "Replacing it with /z/: 'these' → 'zeez'."],
    words: ["this", "that", "mother", "weather", "another", "together"],
    sentences: ["This is my mother.", "They are together in that weather."],
    pairs: [
      { contrast: "/ð/ vs /d/", a: "then", b: "den", note: "Soft buzz vs hard stop." },
      { contrast: "/ð/ vs /z/", a: "these", b: "zees", note: "Tongue out vs tongue behind the teeth." },
    ],
  },
  {
    symbol: "/s/",
    name: "s",
    group: "fricative",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Tongue near the ridge, blow a thin hiss — no voice.",
    lips: "Slightly spread.",
    teeth: "Almost together.",
    tongue: "Tip close to the ridge, groove in the middle.",
    jaw: "Nearly closed.",
    mistakes: ["Dropping /s/ in plurals and third-person verbs.", "Confusing it with /ʃ/."],
    words: ["see", "class", "some", "office", "answers", "outside"],
    sentences: ["She sees six students.", "Sam speaks fast."],
    pairs: [
      { contrast: "/s/ vs /z/", a: "sip", b: "zip", note: "Voiceless vs voiced." },
      { contrast: "/s/ vs /ʃ/", a: "sea", b: "she", note: "Thin hiss vs wide, rounded hush." },
    ],
  },
  {
    symbol: "/z/",
    name: "z",
    group: "fricative",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Same as /s/ but with the voice buzzing.",
    lips: "Slightly spread.",
    teeth: "Almost together.",
    tongue: "Tip near the ridge.",
    jaw: "Nearly closed.",
    mistakes: [
      "Turning final /z/ into /s/: 'is' → 'iss'.",
      "Forgetting that most plural -s endings after voiced sounds are /z/.",
    ],
    words: ["zoo", "is", "busy", "these", "because", "music"],
    sentences: ["These lazy days are easy.", "He is busy because of music."],
    pairs: [
      { contrast: "/z/ vs /s/", a: "buzz", b: "bus", note: "Keep the voice on for /z/." },
      { contrast: "/z/ vs /dʒ/", a: "zip", b: "gyp", note: "Smooth buzz vs stop plus buzz." },
    ],
  },
  {
    symbol: "/ʃ/",
    name: "sh",
    group: "fricative",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Push the lips forward and hush — no voice.",
    lips: "Rounded and pushed forward.",
    teeth: "Close together.",
    tongue: "Broad and close to the roof, a little behind /s/.",
    jaw: "Nearly closed.",
    mistakes: ["Using /s/ instead.", "Forgetting the lip rounding."],
    words: ["she", "shop", "fish", "nation", "sure", "machine"],
    sentences: ["She should shop for fresh fish.", "That station is sure to be shut."],
    pairs: [
      { contrast: "/ʃ/ vs /s/", a: "ship", b: "sip", note: "Rounded hush vs thin hiss." },
      { contrast: "/ʃ/ vs /tʃ/", a: "share", b: "chair", note: "Smooth air vs stop first." },
    ],
  },
  {
    symbol: "/ʒ/",
    name: "zh",
    group: "fricative",
    voiced: true,
    level: "advanced",
    difficulty: "hard",
    how: "Same as /ʃ/ but with the voice buzzing.",
    lips: "Rounded and forward.",
    teeth: "Close together.",
    tongue: "Broad, near the roof.",
    jaw: "Nearly closed.",
    mistakes: ["Replacing it with /dʒ/: 'measure' → 'mejure'.", "Devoicing it into /ʃ/."],
    words: ["measure", "usually", "decision", "vision", "pleasure", "garage"],
    sentences: ["It is a pleasure to measure.", "Usually the decision is her vision."],
    pairs: [
      { contrast: "/ʒ/ vs /ʃ/", a: "measure", b: "mesher", note: "Voiced vs voiceless." },
      { contrast: "/ʒ/ vs /dʒ/", a: "vision", b: "pigeon", note: "Smooth buzz vs stop plus buzz." },
    ],
  },
  {
    symbol: "/h/",
    name: "h",
    group: "fricative",
    voiced: false,
    level: "beginner",
    difficulty: "easy",
    how: "Just breathe out gently before the vowel.",
    lips: "Ready for the next vowel.",
    teeth: "Apart.",
    tongue: "Neutral.",
    jaw: "Open.",
    mistakes: ["Making it too strong and throaty.", "Dropping it: 'hate' → 'ate'."],
    words: ["hello", "have", "behind", "who", "perhaps", "hospital"],
    sentences: ["He has a happy home.", "How high is the hill?"],
    pairs: [
      { contrast: "/h/ vs no /h/", a: "hair", b: "air", note: "Add a soft breath for /h/." },
      { contrast: "/h/ vs /k/", a: "hat", b: "cat", note: "Free breath vs hard stop." },
    ],
  },

  /* ------------------------------- affricates ------------------------------ */
  {
    symbol: "/tʃ/",
    name: "ch",
    group: "affricate",
    voiced: false,
    level: "beginner",
    difficulty: "medium",
    how: "Stop the air with the tongue, then release it into 'sh' — no voice.",
    lips: "Rounded and forward.",
    teeth: "Close.",
    tongue: "Front touches the ridge, then releases.",
    jaw: "Nearly closed.",
    mistakes: ["Using the Vietnamese 'ch', which is softer and has no release.", "Confusing it with /ʃ/."],
    words: ["chair", "teacher", "watch", "much", "kitchen", "picture"],
    sentences: ["Which chair did the teacher choose?", "I watch much less each March."],
    pairs: [
      { contrast: "/tʃ/ vs /ʃ/", a: "chip", b: "ship", note: "Stop first vs smooth air." },
      { contrast: "/tʃ/ vs /dʒ/", a: "cheap", b: "jeep", note: "Voiceless vs voiced." },
    ],
  },
  {
    symbol: "/dʒ/",
    name: "j",
    group: "affricate",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Same as /tʃ/ but with the voice on.",
    lips: "Rounded and forward.",
    teeth: "Close.",
    tongue: "Front touches the ridge, then releases with a buzz.",
    jaw: "Nearly closed.",
    mistakes: ["Replacing it with /j/: 'job' → 'yob'.", "Replacing it with /z/."],
    words: ["job", "judge", "age", "bridge", "manager", "language"],
    sentences: ["John's job is a joy.", "The manager just changed the language."],
    pairs: [
      { contrast: "/dʒ/ vs /tʃ/", a: "jeep", b: "cheap", note: "Voiced vs voiceless." },
      { contrast: "/dʒ/ vs /j/", a: "jet", b: "yet", note: "Stop plus buzz vs smooth glide." },
    ],
  },

  /* --------------------------------- nasals -------------------------------- */
  {
    symbol: "/m/",
    name: "m",
    group: "nasal",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Close the lips and hum through the nose.",
    lips: "Closed.",
    teeth: "Not involved.",
    tongue: "Neutral.",
    jaw: "Closed.",
    mistakes: ["Opening the lips too early at the end of a word.", "Cutting the hum short."],
    words: ["man", "some", "summer", "time", "remember", "problem"],
    sentences: ["My mum makes me smile.", "Remember to come at midday."],
    pairs: [
      { contrast: "/m/ vs /n/", a: "some", b: "sun", note: "Lips closed vs tongue on the ridge." },
      { contrast: "/m/ vs /b/", a: "mat", b: "bat", note: "Air through the nose vs a lip release." },
    ],
  },
  {
    symbol: "/n/",
    name: "n",
    group: "nasal",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Tongue tip on the ridge, hum through the nose.",
    lips: "Relaxed.",
    teeth: "Apart.",
    tongue: "Tip on the ridge behind the upper teeth.",
    jaw: "Nearly closed.",
    mistakes: ["Turning final /n/ into /ŋ/.", "Dropping /n/ in 'and'."],
    words: ["no", "name", "nine", "again", "different", "know"],
    sentences: ["Nine new names.", "I know nothing at noon."],
    pairs: [
      { contrast: "/n/ vs /ŋ/", a: "sin", b: "sing", note: "Tongue tip up vs tongue back up." },
      { contrast: "/n/ vs /m/", a: "run", b: "rum", note: "Ridge vs lips." },
    ],
  },
  {
    symbol: "/ŋ/",
    name: "ng",
    group: "nasal",
    voiced: true,
    level: "intermediate",
    difficulty: "medium",
    how: "Back of the tongue up, hum through the nose — no /ɡ/ at the end.",
    lips: "Relaxed.",
    teeth: "Apart.",
    tongue: "Back against the soft palate; tip stays down.",
    jaw: "Half open.",
    mistakes: ["Adding a /ɡ/: 'singing' → 'singging'.", "Replacing it with /n/."],
    words: ["sing", "long", "thinking", "morning", "English", "young"],
    sentences: ["I am thinking of singing.", "Good morning, young English student."],
    pairs: [
      { contrast: "/ŋ/ vs /n/", a: "thing", b: "thin", note: "Tongue back vs tongue tip." },
      { contrast: "/ŋ/ vs /ŋɡ/", a: "singer", b: "finger", note: "'Singer' has no /ɡ/; 'finger' does." },
    ],
  },

  /* ------------------------------ approximants ----------------------------- */
  {
    symbol: "/l/",
    name: "l",
    group: "approximant",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Tongue tip presses the ridge; air flows around the sides.",
    lips: "Relaxed and open.",
    teeth: "Apart.",
    tongue: "Tip firmly on the ridge behind the upper teeth.",
    jaw: "Half open.",
    mistakes: [
      "Dropping the final /l/ in 'call' or 'people'.",
      "Turning /l/ into /n/ — a very common Vietnamese swap.",
    ],
    words: ["light", "like", "little", "call", "people", "already"],
    sentences: ["Little Lily likes it.", "Please call all the people."],
    pairs: [
      { contrast: "/l/ vs /r/", a: "light", b: "right", note: "Tongue touches vs tongue curls." },
      { contrast: "/l/ vs /n/", a: "low", b: "no", note: "Air out of the mouth vs out of the nose." },
    ],
  },
  {
    symbol: "/r/",
    name: "r",
    group: "approximant",
    voiced: true,
    level: "beginner",
    difficulty: "hard",
    how: "Curl the tongue up and back without touching anything, lips slightly round.",
    lips: "Slightly rounded, pushed forward.",
    teeth: "Apart.",
    tongue: "Tip curled up and back, never touching the roof.",
    jaw: "Half open.",
    mistakes: [
      "Rolling or tapping the /r/ like a Vietnamese 'r'.",
      "Replacing it with /z/ or /ʒ/.",
      "Adding /r/ where British English has none.",
    ],
    words: ["red", "very", "around", "practise", "problem", "already"],
    sentences: ["Robert reads rarely.", "Try to practise the right words."],
    pairs: [
      { contrast: "/r/ vs /l/", a: "right", b: "light", note: "Curl vs touch." },
      { contrast: "/r/ vs /w/", a: "run", b: "won", note: "Tongue curl vs lips only." },
    ],
    accentNote: "American English pronounces /r/ everywhere; British RP drops it before a consonant or pause.",
  },
  {
    symbol: "/j/",
    name: "y glide",
    group: "approximant",
    voiced: true,
    level: "beginner",
    difficulty: "easy",
    how: "Start near /iː/ and glide straight into the next vowel.",
    lips: "Spread.",
    teeth: "Close.",
    tongue: "High and forward, then moving.",
    jaw: "Nearly closed, opening.",
    mistakes: ["Replacing it with /dʒ/: 'yes' → 'jes'.", "Making it a separate syllable."],
    words: ["yes", "year", "you", "music", "beautiful", "usually"],
    sentences: ["Yes, you are young.", "Beautiful music every year."],
    pairs: [
      { contrast: "/j/ vs /dʒ/", a: "yet", b: "jet", note: "Smooth glide vs stop plus buzz." },
      { contrast: "/juː/ vs /uː/", a: "cute", b: "coot", note: "With and without the glide." },
    ],
  },
  {
    symbol: "/w/",
    name: "w glide",
    group: "approximant",
    voiced: true,
    level: "beginner",
    difficulty: "medium",
    how: "Round the lips tightly, then glide into the vowel.",
    lips: "Tightly rounded, then opening.",
    teeth: "Not involved.",
    tongue: "Back and high, then moving.",
    jaw: "Nearly closed, opening.",
    mistakes: ["Using /v/ instead of /w/.", "Skipping the lip rounding in 'work' or 'want'."],
    words: ["we", "want", "work", "away", "question", "always"],
    sentences: ["We want to work with you.", "Why would we wait?"],
    pairs: [
      { contrast: "/w/ vs /v/", a: "wine", b: "vine", note: "Lips only vs teeth on lip." },
      { contrast: "/w/ vs /r/", a: "wed", b: "red", note: "Lips vs tongue curl." },
    ],
  },
];

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

/** Finds phonemes mentioned in coach feedback so we can deep-link a drill. */
export function findPhoneme(symbol: string): Phoneme | undefined {
  const clean = `/${symbol.replaceAll("/", "").trim()}/`;
  return PHONEMES.find((p) => p.symbol === clean || p.usSymbol === clean);
}

export const SOUND_COUNT = PHONEMES.length;

/** First 3 sounds are free (Yêu cầu 5) — sound 4 onward needs Premium. */
export const FREE_SOUND_COUNT = 3;

export function isSoundIndexFree(index: number): boolean {
  return index >= 0 && index < FREE_SOUND_COUNT;
}

/** Same symbol-matching rule as findPhoneme(), but returns the canonical
 * position in PHONEMES (or -1) so a caller can check the free allowance. */
export function findSoundIndex(symbol: string): number {
  const clean = `/${symbol.replaceAll("/", "").trim()}/`;
  return PHONEMES.findIndex((p) => p.symbol === clean || p.usSymbol === clean);
}
