/**
 * DEMO MODE sample data.
 * Used only when the visitor is not signed in (so no real AI call is made).
 * Everything rendered from here MUST be labelled DEMO in the UI — it is a
 * pre-written sample, not real AI analysis.
 */

export const DEMO_SPEAKING = {
  question: "What do you usually do on weekends?",
  transcript:
    "On weekend I usually go to the cafe with my friend and we talking about the week. Sometime I very like cooking for my family.",
  fluency: 7,
  grammar: 6,
  vocabulary: 7,
  pronunciation: null as number | null,
  overall: 6.5,
  mistakes: [
    { wrong: "On weekend", why: "Weekends is plural when you talk about them in general." },
    { wrong: "we talking", why: "You need the auxiliary verb: we are talking / we talk." },
    { wrong: "I very like", why: "\"Very\" cannot modify a verb directly." },
  ],
  corrections: [
    { from: "On weekend I usually go", to: "On weekends I usually go" },
    { from: "we talking about the week", to: "we talk about the week" },
    { from: "I very like cooking", to: "I really like cooking" },
  ],
  better_vocabulary: [
    { instead_of: "go to the cafe", use: "head out to a café" },
    { instead_of: "talking about the week", use: "catching up on the week" },
  ],
  natural_answer:
    "On weekends I usually head out to a café with my friends and we catch up on the week. I also really enjoy cooking something new for my family.",
  feedback:
    "Lovely, natural content — you sound relaxed. Watch plural nouns and the auxiliary verb in continuous tenses. Try linking your ideas with \"and then\" to sound smoother.",
};

export const DEMO_CORRECTION = {
  input: "I very like English because it help me communicate.",
  corrections: [
    { from: "I very like English", to: "I really like English", why: "\"Very\" cannot modify the verb \"like\"." },
    { from: "it help me", to: "it helps me", why: "Third person singular needs -s." },
  ],
  natural: "I really like English because it helps me communicate with other people.",
  explanation:
    "Use \"really\" or \"a lot\" with verbs, and remember the -s ending after he, she and it. Adding \"with other people\" makes the sentence feel complete.",
};

export const DEMO_CONVERSATION = [
  { role: "assistant" as const, content: "Hi! It's great to meet you. What do you like to do in your free time?" },
  { role: "user" as const, content: "I like watch movie and sometimes I go running." },
  {
    role: "assistant" as const,
    content:
      "Nice — so you like watching movies and going running. That's a great balance! What kind of movies do you enjoy most?",
  },
];

export const DEMO_PRONUNCIATION = {
  target: "She needs a clean sheet of paper.",
  readBack: "She needs a clean shit of paper.",
  matched: ["she", "needs", "a", "clean", "of", "paper"],
  missed: ["sheet"],
  feedback:
    "Your /iː/ in \"sheet\" came out short, so it sounded like /ɪ/. Spread your lips into a smile and hold the sound about twice as long.",
  feedbackVi:
    "Âm /iː/ trong \"sheet\" của bạn bị ngắn nên nghe thành /ɪ/. Hãy kéo môi sang hai bên như đang cười và giữ âm dài gấp đôi.",
};

export const DEMO_IELTS = {
  question: "Describe a person who has influenced you.",
  transcript:
    "I want to talk about my old teacher. She teach me maths when I was fifteen and she always very patient with me. Because of her I start to believe I can study well.",
  fluency_coherence: 6,
  lexical_resource: 6,
  grammatical_range: 5.5,
  pronunciation: null as number | null,
  estimated_band: 6,
  feedback:
    "You answered all parts of the cue card with clear structure. Tense control slips under pressure — practise past simple with irregular verbs. Add one or two precise adjectives to lift your lexical score.",
  corrected_answer:
    "I want to talk about my old teacher. She taught me maths when I was fifteen and she was always very patient with me. Because of her, I started to believe I could study well.",
  natural_answer:
    "I'd like to talk about my old maths teacher. She taught me when I was fifteen, and she was endlessly patient with me. Thanks to her, I started to believe I was actually capable.",
  band6_version:
    "I want to talk about my old maths teacher. She taught me when I was fifteen and she was very patient. Because of her, I started to believe I could study well.",
  band7_version:
    "I'd like to talk about my former maths teacher, who taught me when I was fifteen. She was remarkably patient, and thanks to her encouragement I gradually began to believe in my own ability.",
  band8_version:
    "The person who has influenced me most is my former maths teacher. She took me on at fifteen, when I'd more or less written myself off academically, and her unfailing patience slowly rebuilt my confidence — I owe my whole approach to studying to her.",
};

export const DEMO_SOUND_PROGRESS = [
  { sound: "/iː/", score: 92 },
  { sound: "/ɪ/", score: 87 },
  { sound: "/æ/", score: 72 },
  { sound: "/ʌ/", score: 65 },
  { sound: "/θ/", score: 58 },
];
