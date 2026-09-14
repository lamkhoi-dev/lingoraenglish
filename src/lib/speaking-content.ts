/**
 * Static speaking-practice content for Lingora English.
 * Everything here is *prompt* content — questions, situations, scripts and
 * vocabulary. All scoring and feedback comes from the real AI server functions.
 */

/* ------------------------------ AI Speaking Coach --------------------------- */

export type CoachModeId = "free" | "daily" | "roleplay" | "interview" | "challenge";

export const COACH_MODES: { id: CoachModeId; label: string; blurb: string }[] = [
  { id: "free", label: "Free Conversation", blurb: "Talk naturally about any topic you like." },
  { id: "daily", label: "Daily Conversation", blurb: "Realistic everyday situations." },
  { id: "roleplay", label: "Role-play", blurb: "Choose a role and act out the scene." },
  { id: "interview", label: "Interview Practice", blurb: "The coach becomes your interviewer." },
  { id: "challenge", label: "Speaking Challenge", blurb: "60 seconds on one topic, then get scored." },
];

export const DAILY_SITUATIONS = [
  "Meeting someone new",
  "At a restaurant",
  "At a coffee shop",
  "Grocery shopping",
  "Going to the bank",
  "Talking to a doctor",
  "Making a phone call",
  "Asking for directions",
  "Talking to a coworker",
  "Talking to a neighbour",
  "Making an appointment",
  "Travelling",
  "At an airport",
  "Hotel check-in",
  "Driving",
  "Canadian daily life",
];

export const ROLEPLAYS: { id: string; label: string; you: string; coach: string }[] = [
  { id: "restaurant", label: "Customer / Server", you: "Customer", coach: "Server in a busy restaurant" },
  { id: "class", label: "Student / Teacher", you: "Student", coach: "Teacher after class" },
  { id: "work", label: "Employee / Manager", you: "Employee", coach: "Manager in a one-to-one meeting" },
  { id: "clinic", label: "Patient / Doctor", you: "Patient", coach: "Family doctor at a clinic" },
  { id: "bank", label: "Customer / Bank Employee", you: "Customer", coach: "Bank employee opening an account" },
  { id: "traffic", label: "Driver / Police Officer", you: "Driver", coach: "Police officer at a traffic stop" },
  { id: "interviewrp", label: "Job Applicant / Interviewer", you: "Job applicant", coach: "Hiring manager" },
  { id: "rental", label: "Tenant / Landlord", you: "Tenant", coach: "Landlord about a repair" },
];

export const INTERVIEW_SETS: { id: string; label: string; questions: string[] }[] = [
  {
    id: "job",
    label: "Job interview",
    questions: [
      "Tell me a little about yourself.",
      "Why are you interested in this position?",
      "Tell me about a difficult situation at work and how you handled it.",
      "Where do you see yourself in five years?",
    ],
  },
  {
    id: "college",
    label: "College interview",
    questions: [
      "Why did you choose this programme?",
      "What subject do you enjoy most, and why?",
      "Tell me about something you are proud of.",
    ],
  },
  {
    id: "general",
    label: "General English interview",
    questions: [
      "How do you usually spend your weekends?",
      "What kind of work would you like to do in the future?",
      "Describe the place where you live.",
    ],
  },
  {
    id: "ielts",
    label: "IELTS-style interview",
    questions: [
      "Let's talk about your hometown. Where are you from?",
      "Do you prefer living in a city or the countryside? Why?",
      "How has your city changed in the last ten years?",
    ],
  },
];

export const CHALLENGE_TOPICS = [
  "Speak for 60 seconds about your favourite place.",
  "Speak for 60 seconds about a person who influenced you.",
  "Speak for 60 seconds about a skill you would like to learn.",
  "Speak for 60 seconds about the best meal you have ever had.",
  "Speak for 60 seconds about how technology changed your daily life.",
  "Speak for 60 seconds about a trip that did not go as planned.",
];

/* --------------------------------- Shadowing -------------------------------- */

export type ShadowLevel = "beginner" | "intermediate" | "advanced";

export const SHADOW_LEVELS: { id: ShadowLevel; label: string; blurb: string }[] = [
  { id: "beginner", label: "Beginner", blurb: "Short, simple sentences." },
  { id: "intermediate", label: "Intermediate", blurb: "Natural daily conversations." },
  { id: "advanced", label: "Advanced", blurb: "Longer, fully natural native English." },
];

export const SHADOW_CATEGORIES = [
  "Daily Conversations",
  "Work English",
  "Social English",
  "Travel English",
  "Canadian Life",
  "IELTS",
  "TOEFL",
  "PTE",
] as const;

export type ShadowLesson = {
  id: string;
  level: ShadowLevel;
  category: (typeof SHADOW_CATEGORIES)[number];
  title: string;
  lines: string[];
  vocab: { word: string; meaning: string }[];
};

export const SHADOW_LESSONS: ShadowLesson[] = [
  {
    id: "small-talk",
    level: "beginner",
    category: "Daily Conversations",
    title: "Making small talk",
    lines: [
      "Hey, how's your day going?",
      "Pretty good, thanks. A little busy.",
      "I know the feeling. Any plans for the weekend?",
      "Not really. I might just relax at home.",
    ],
    vocab: [
      { word: "pretty good", meaning: "quite good — a casual, friendly answer" },
      { word: "I know the feeling", meaning: "I understand, the same happens to me" },
    ],
  },
  {
    id: "coffee-order",
    level: "beginner",
    category: "Daily Conversations",
    title: "Ordering at a coffee shop",
    lines: [
      "Hi, can I get a medium latte, please?",
      "Sure. For here or to go?",
      "To go, please. And could I have it a little less sweet?",
      "No problem. That'll be five twenty-five.",
    ],
    vocab: [
      { word: "to go", meaning: "to take away, not drink in the shop" },
      { word: "that'll be", meaning: "the price is" },
    ],
  },
  {
    id: "team-standup",
    level: "intermediate",
    category: "Work English",
    title: "Speaking up in a team meeting",
    lines: [
      "Thanks for the update. I'd like to add one quick point.",
      "We're slightly behind on the second task, but we should catch up by Friday.",
      "If anyone has time to review the draft, that would really help.",
      "I'll send it over right after this meeting.",
    ],
    vocab: [
      { word: "behind on", meaning: "later than planned with something" },
      { word: "catch up", meaning: "return to the planned schedule" },
    ],
  },
  {
    id: "asking-help",
    level: "intermediate",
    category: "Work English",
    title: "Asking a coworker for help",
    lines: [
      "Do you have a couple of minutes? I'm stuck on something.",
      "I can't figure out why this report doesn't match the numbers.",
      "If you could take a quick look, I'd really appreciate it.",
      "Thanks so much — that saves me a lot of time.",
    ],
    vocab: [
      { word: "stuck on", meaning: "unable to continue with something" },
      { word: "take a quick look", meaning: "check briefly" },
    ],
  },
  {
    id: "meeting-friends",
    level: "intermediate",
    category: "Social English",
    title: "Making plans with friends",
    lines: [
      "We should definitely get together sometime this week.",
      "How does Thursday evening sound to you?",
      "Let's meet around seven, and we can decide where to eat later.",
      "Sounds great. I'll text you when I'm on my way.",
    ],
    vocab: [
      { word: "get together", meaning: "meet socially" },
      { word: "on my way", meaning: "already travelling to the place" },
    ],
  },
  {
    id: "airport",
    level: "intermediate",
    category: "Travel English",
    title: "At the airport check-in",
    lines: [
      "Good morning. I'm checking in for the flight to Toronto.",
      "Here's my passport and my booking reference.",
      "I only have one bag to check, and this one is a carry-on.",
      "Could I get an aisle seat if there's still one available?",
    ],
    vocab: [
      { word: "carry-on", meaning: "a small bag you take into the cabin" },
      { word: "aisle seat", meaning: "the seat next to the walking path" },
    ],
  },
  {
    id: "canada-winter",
    level: "intermediate",
    category: "Canadian Life",
    title: "Talking about a Canadian winter",
    lines: [
      "It's supposed to drop to minus twenty tonight, so bundle up.",
      "The sidewalks get pretty icy, especially early in the morning.",
      "I usually take the bus in winter instead of driving.",
      "Honestly, once you get used to it, it's not that bad.",
    ],
    vocab: [
      { word: "bundle up", meaning: "dress in warm clothes" },
      { word: "get used to it", meaning: "become comfortable with it over time" },
    ],
  },
  {
    id: "ielts-describe",
    level: "advanced",
    category: "IELTS",
    title: "Describing a place (IELTS Part 2 style)",
    lines: [
      "The place I'd like to talk about is a small lakeside town I visited last summer.",
      "What struck me most was how peaceful it was, especially early in the morning.",
      "I remember sitting by the water with a coffee, watching the mist lift off the lake.",
      "I'd say that trip changed the way I think about taking time off.",
    ],
    vocab: [
      { word: "what struck me most", meaning: "the thing I noticed most strongly" },
      { word: "taking time off", meaning: "having a break from work" },
    ],
  },
  {
    id: "toefl-campus",
    level: "advanced",
    category: "TOEFL",
    title: "Campus opinion response",
    lines: [
      "Personally, I think extending the library hours would benefit most students.",
      "Many of us study late in the evening, particularly during exam periods.",
      "That said, the university would need to consider the additional staffing costs.",
      "On balance, though, I believe the benefits clearly outweigh the drawbacks.",
    ],
    vocab: [
      { word: "that said", meaning: "however, on the other hand" },
      { word: "outweigh the drawbacks", meaning: "be more important than the disadvantages" },
    ],
  },
  {
    id: "pte-read-aloud",
    level: "advanced",
    category: "PTE",
    title: "Read aloud: academic passage",
    lines: [
      "Urban planners increasingly rely on data collected from public transport networks.",
      "By analysing travel patterns, they can identify which routes require additional capacity.",
      "This approach reduces congestion while keeping infrastructure costs under control.",
    ],
    vocab: [
      { word: "congestion", meaning: "too much traffic in one place" },
      { word: "capacity", meaning: "how much a system can carry" },
    ],
  },
];

/* --------------------------- Everyday situations --------------------------- */

export type DailyTopic = {
  id: string;
  group: string;
  title: string;
  expressions: string[];
  vocab: string[];
  dialogue: { who: "A" | "B"; line: string }[];
  prompt: string;
};

export const DAILY_GROUPS = [
  "Everyday Life",
  "Shopping",
  "Food",
  "Transportation",
  "Health",
  "Money",
  "Work",
  "Social English",
  "Canadian Life",
] as const;

export const DAILY_TOPICS: DailyTopic[] = [
  {
    id: "introducing",
    group: "Everyday Life",
    title: "Introducing yourself",
    expressions: ["Nice to meet you.", "I'm originally from…", "I've been living here for about…"],
    vocab: ["originally", "background", "get settled"],
    dialogue: [
      { who: "A", line: "Hi, I'm Maya. I don't think we've met." },
      { who: "B", line: "Nice to meet you, Maya. I'm Daniel — I just started last week." },
      { who: "A", line: "Oh, welcome! How are you settling in?" },
    ],
    prompt: "Introduce yourself: your name, where you're from, and what you do.",
  },
  {
    id: "routine",
    group: "Everyday Life",
    title: "Your daily routine",
    expressions: ["I usually get up around…", "After that, I…", "In the evening I tend to…"],
    vocab: ["get up", "head out", "wind down"],
    dialogue: [
      { who: "A", line: "What does a normal weekday look like for you?" },
      { who: "B", line: "I get up at six, head out by seven, and I'm usually home by six." },
    ],
    prompt: "Describe your typical weekday from morning to evening.",
  },
  {
    id: "small-talk",
    group: "Everyday Life",
    title: "Small talk",
    expressions: ["How's it going?", "Crazy weather today, isn't it?", "Anyway, I should get going."],
    vocab: ["catch up", "by the way", "get going"],
    dialogue: [
      { who: "A", line: "Crazy weather today, isn't it?" },
      { who: "B", line: "Tell me about it. I wasn't ready for this at all." },
    ],
    prompt: "Make two minutes of small talk about the weather and your weekend.",
  },
  {
    id: "returning-item",
    group: "Shopping",
    title: "Returning an item",
    expressions: ["I'd like to return this, please.", "I have the receipt right here.", "Can I get a refund instead of store credit?"],
    vocab: ["receipt", "refund", "store credit", "exchange"],
    dialogue: [
      { who: "A", line: "Hi, I'd like to return this jacket. It doesn't fit." },
      { who: "B", line: "No problem. Do you have the receipt with you?" },
    ],
    prompt: "Return a pair of shoes that are too small and ask for a refund.",
  },
  {
    id: "prices",
    group: "Shopping",
    title: "Asking about prices",
    expressions: ["How much is this?", "Is this on sale?", "Do you have this in a different size?"],
    vocab: ["on sale", "discount", "out of stock"],
    dialogue: [
      { who: "A", line: "Excuse me, is this on sale?" },
      { who: "B", line: "It is — it's twenty percent off this week." },
    ],
    prompt: "Ask a store assistant about the price and whether there's a discount.",
  },
  {
    id: "ordering-food",
    group: "Food",
    title: "Ordering food",
    expressions: ["Could I get the…, please?", "Does that come with…?", "Could I have that without…?"],
    vocab: ["side", "appetizer", "to go", "split the bill"],
    dialogue: [
      { who: "A", line: "Are you ready to order?" },
      { who: "B", line: "Yes, could I get the chicken sandwich, please? Does that come with fries?" },
    ],
    prompt: "Order a main dish and a drink, and ask one question about the menu.",
  },
  {
    id: "reservation",
    group: "Food",
    title: "Making a reservation",
    expressions: ["I'd like to book a table for two.", "Do you have anything around seven?", "Could we sit by the window?"],
    vocab: ["book a table", "party of four", "fully booked"],
    dialogue: [
      { who: "A", line: "Hi, I'd like to book a table for two on Friday." },
      { who: "B", line: "Of course. What time were you thinking?" },
    ],
    prompt: "Call a restaurant and book a table for four on Saturday evening.",
  },
  {
    id: "directions",
    group: "Transportation",
    title: "Asking for directions",
    expressions: ["Excuse me, how do I get to…?", "Is it within walking distance?", "Which bus should I take?"],
    vocab: ["block", "intersection", "transfer", "walking distance"],
    dialogue: [
      { who: "A", line: "Excuse me, how do I get to the train station from here?" },
      { who: "B", line: "Go straight two blocks, then turn left at the lights." },
    ],
    prompt: "Ask a stranger how to get to the nearest pharmacy and repeat the directions back.",
  },
  {
    id: "taxi",
    group: "Transportation",
    title: "Taking a taxi",
    expressions: ["Could you take me to…?", "How long will it take?", "Can I pay by card?"],
    vocab: ["fare", "drop off", "pick up"],
    dialogue: [
      { who: "A", line: "Where to?" },
      { who: "B", line: "The airport, please. Terminal one." },
    ],
    prompt: "Take a taxi to the airport and ask about the fare and travel time.",
  },
  {
    id: "doctor",
    group: "Health",
    title: "Talking to a doctor",
    expressions: ["I've been feeling…", "It started about three days ago.", "Should I be worried?"],
    vocab: ["symptoms", "prescription", "side effects", "referral"],
    dialogue: [
      { who: "A", line: "What brings you in today?" },
      { who: "B", line: "I've had a sore throat and a headache for about three days." },
    ],
    prompt: "Describe your symptoms to a doctor and ask what you should do next.",
  },
  {
    id: "appointment",
    group: "Health",
    title: "Making an appointment",
    expressions: ["I'd like to make an appointment.", "Is there anything earlier?", "Do I need to bring anything?"],
    vocab: ["walk-in", "reschedule", "health card"],
    dialogue: [
      { who: "A", line: "I'd like to make an appointment with Dr. Chen." },
      { who: "B", line: "The earliest we have is next Tuesday at ten." },
    ],
    prompt: "Call a clinic and make an appointment for next week.",
  },
  {
    id: "bank",
    group: "Money",
    title: "At the bank",
    expressions: ["I'd like to open an account.", "What are the monthly fees?", "Could you explain how that works?"],
    vocab: ["chequing account", "interest rate", "monthly fee", "e-transfer"],
    dialogue: [
      { who: "A", line: "How can I help you today?" },
      { who: "B", line: "I'd like to open a chequing account, please." },
    ],
    prompt: "Open a bank account and ask two questions about fees.",
  },
  {
    id: "bills",
    group: "Money",
    title: "Paying bills",
    expressions: ["I'd like to set up automatic payments.", "I think I was charged twice.", "When is the due date?"],
    vocab: ["due date", "late fee", "statement", "overdue"],
    dialogue: [
      { who: "A", line: "I think I was charged twice for last month." },
      { who: "B", line: "Let me check that for you. Do you have the statement?" },
    ],
    prompt: "Call a company about a billing mistake and ask them to fix it.",
  },
  {
    id: "meetings",
    group: "Work",
    title: "In a meeting",
    expressions: ["Could I add something here?", "Just to clarify…", "Let's follow up on that after the meeting."],
    vocab: ["agenda", "follow up", "action item", "deadline"],
    dialogue: [
      { who: "A", line: "Does anyone have anything to add before we finish?" },
      { who: "B", line: "Just to clarify — is the deadline Thursday or Friday?" },
    ],
    prompt: "Give a short update in a meeting and ask one clarifying question.",
  },
  {
    id: "requests",
    group: "Work",
    title: "Making requests politely",
    expressions: ["Would you mind…?", "Could you possibly…?", "Whenever you get a chance…"],
    vocab: ["favour", "urgent", "get a chance"],
    dialogue: [
      { who: "A", line: "Would you mind sending me that file when you get a chance?" },
      { who: "B", line: "Sure, I'll do it right after this call." },
    ],
    prompt: "Politely ask a coworker for help with a task that's due today.",
  },
  {
    id: "opinions",
    group: "Social English",
    title: "Giving opinions",
    expressions: ["Personally, I think…", "I see your point, but…", "That's a fair point."],
    vocab: ["I'd say", "on the other hand", "fair point"],
    dialogue: [
      { who: "A", line: "Do you think working from home is better?" },
      { who: "B", line: "Personally, I think a mix works best. I'd miss the office completely." },
    ],
    prompt: "Give your opinion about working from home and explain why.",
  },
  {
    id: "invitations",
    group: "Social English",
    title: "Invitations and plans",
    expressions: ["Do you want to join us?", "I'd love to, but…", "Let's play it by ear."],
    vocab: ["join us", "count me in", "play it by ear"],
    dialogue: [
      { who: "A", line: "We're grabbing dinner after work — do you want to join us?" },
      { who: "B", line: "Count me in. What time are you heading out?" },
    ],
    prompt: "Invite a friend to dinner, then accept an invitation you receive.",
  },
  {
    id: "newcomer",
    group: "Canadian Life",
    title: "Newcomer essentials",
    expressions: ["I just moved here.", "Do you know where I can apply for…?", "How does that usually work here?"],
    vocab: ["SIN number", "health card", "lease", "utilities"],
    dialogue: [
      { who: "A", line: "I just moved here last month. Do you know where I apply for a health card?" },
      { who: "B", line: "There's a service centre downtown — bring your ID and proof of address." },
    ],
    prompt: "Explain that you're new in Canada and ask how to set up your health card.",
  },
];

/* ------------------------------ TOEFL and PTE ------------------------------ */

export type TestTask = {
  id: string;
  label: string;
  instructions: string;
  prepSeconds: number;
  speakSeconds: number;
  /** Text the learner must read aloud or repeat, when the task requires one. */
  script?: string;
  prompts: string[];
};

export const TOEFL_TASKS: TestTask[] = [
  {
    id: "listen-repeat",
    label: "Listen & Repeat",
    instructions: "Listen to the sentence, then repeat it as accurately and naturally as you can.",
    prepSeconds: 0,
    speakSeconds: 20,
    script: "The committee agreed to postpone the decision until further data becomes available.",
    prompts: [
      "The committee agreed to postpone the decision until further data becomes available.",
      "Most students find the second assignment considerably more demanding than the first.",
      "Researchers noticed a steady decline in the population over the past decade.",
    ],
  },
  {
    id: "interview",
    label: "Take an Interview",
    instructions: "Answer the interviewer's question naturally. Speak for about 45 seconds.",
    prepSeconds: 15,
    speakSeconds: 45,
    prompts: [
      "Some students prefer studying alone, others in groups. Which do you prefer, and why?",
      "Do you think universities should require students to take physical education? Explain.",
      "Describe a class you enjoyed and explain why it was valuable to you.",
    ],
  },
];

export const PTE_TASKS: TestTask[] = [
  {
    id: "read-aloud",
    label: "Read Aloud",
    instructions: "You have 35 seconds to prepare, then read the text aloud naturally.",
    prepSeconds: 35,
    speakSeconds: 40,
    script:
      "Public libraries have changed considerably over the last twenty years, offering digital access, community programmes and study spaces alongside their traditional collections.",
    prompts: [
      "Public libraries have changed considerably over the last twenty years, offering digital access, community programmes and study spaces alongside their traditional collections.",
      "Renewable energy now supplies a growing share of electricity in many countries, although storage remains a significant technical challenge.",
    ],
  },
  {
    id: "repeat-sentence",
    label: "Repeat Sentence",
    instructions: "Listen to the sentence, then repeat it exactly.",
    prepSeconds: 0,
    speakSeconds: 15,
    script: "The lecture on urban design starts at four in the main hall.",
    prompts: [
      "The lecture on urban design starts at four in the main hall.",
      "Please submit your assignment before the end of the week.",
      "Most of the samples were collected during the summer months.",
    ],
  },
  {
    id: "describe-image",
    label: "Describe Image",
    instructions: "You have 25 seconds to prepare, then describe the situation in detail for 40 seconds.",
    prepSeconds: 25,
    speakSeconds: 40,
    prompts: [
      "Describe a bar chart showing coffee consumption rising steadily from 2015 to 2024.",
      "Describe a line graph comparing bus and car use in a city over ten years.",
      "Describe a pie chart showing how a household spends its monthly income.",
    ],
  },
  {
    id: "retell-lecture",
    label: "Retell Lecture",
    instructions: "Read the lecture summary, then retell it in your own words for 40 seconds.",
    prepSeconds: 20,
    speakSeconds: 40,
    script:
      "The lecturer explains that sleep consolidates memory: during deep sleep the brain replays new information, strengthening the connections formed during the day. Students who sleep well after studying recall significantly more than those who do not.",
    prompts: [
      "Retell the lecture about sleep and memory consolidation in your own words.",
      "Retell a lecture explaining why cities create green spaces to reduce summer heat.",
    ],
  },
  {
    id: "short-question",
    label: "Answer Short Question",
    instructions: "Answer with one or a few words.",
    prepSeconds: 0,
    speakSeconds: 10,
    prompts: [
      "What do we call the person who treats sick animals?",
      "How many days are there in a leap year?",
      "What instrument has black and white keys?",
    ],
  },
];
