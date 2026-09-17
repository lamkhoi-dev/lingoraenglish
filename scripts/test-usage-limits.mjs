/**
 * One-off acceptance check for Yêu cầu 10 — NOT part of the app or any build.
 *
 * Calls the DEPLOYED server functions directly (no browser, no UI) as a FREE
 * learner and asserts that every way of going past a limit is refused
 * server-side: missing practice-item id, locked item, a free item's id paired
 * with a locked item's text, progress/score writes on locked items, reading a
 * locked word's meaning, and the AI Coach's free-turn allowance.
 *
 * Usage (from the repo root, so `seroval` resolves):
 *   node scripts/test-usage-limits.mjs
 *
 * Server-function ids are content hashes that change on every build, so they
 * live in scripts/.usage-limit-ids.json. Regenerate that file after a deploy:
 *   ssh -i ~/.ssh/lingoraenglish_vps root@221.132.19.75  *     "docker exec lingoraenglish-app sh -c 'cat .output/server/__23tanstack-start-server-fn-resolver-*.mjs'" > /tmp/resolver.mjs
 *   node -e 'const fs=require("fs");const s=fs.readFileSync("/tmp/resolver.mjs","utf8");const m={};
 *     for(const x of s.matchAll(/"([0-9a-f]{64})":\s*\{[\s\S]{0,400}?"([A-Za-z0-9_]+)_createServerFn_handler"/g))m[x[2]]=x[1];
 *     fs.writeFileSync("scripts/.usage-limit-ids.json",JSON.stringify(m,null,2))'
 *
 * The content ids in DATA below are production rows (a locked word, a locked
 * test, ...) — refresh them the same way if the content is reseeded.
 */
import { readFileSync } from "node:fs";

import { toJSON } from "seroval";

const BASE = "https://lingoraenglishai.com";
const FN = JSON.parse(readFileSync(new URL("./.usage-limit-ids.json", import.meta.url), "utf8"));
const BASE_URL = process.env["LINGORA_BASE_URL"] ?? BASE;
const EMAIL = process.env["LINGORA_FREE_EMAIL"] ?? "demo-free@lingoraenglish.local";
const PASSWORD = process.env["LINGORA_FREE_PASSWORD"] ?? "Demo@1234";

const DATA = {
  freeWord: "6baa8bea-9ee4-4a6e-9f8e-b7b5828d91b0",
  lockedWord: "b73f412a-dee0-4ead-8aa1-3a8488c035f8",
  lockedWord2: "a142bb06-e747-4f69-9b83-1090190968d5",
  freeTest: "4ed7247c-4c6b-42fc-9e1c-6733651cb002",
  freeTestQuestion: "Do you live in a house or an apartment?",
  lockedTest: "033492f4-095f-4843-810e-916d8625a7cb",
  lockedTestQuestion: "Do you have a lot of friends?",
  lockedLesson: "12f7883d-32c7-4b75-a663-3d9d4bb9883d",
  lockedLessonItem: "First, chop the onions, then fry them in a little oil, and add the garlic once they're soft.",
  coachSession: "1925c7ad-2fa7-4187-a4cb-2f04c431fc8d",
  lockedSentence: "f5dd6cd2-ea58-48cb-8e9b-91dcc2450109",
};

let cookie = "";

async function call(id, data, method = "POST") {
  const payload = data === undefined ? undefined : JSON.stringify(await toJSON({ data }));
  const url =
    method === "GET" && payload
      ? `${BASE_URL}/_serverFn/${id}?payload=${encodeURIComponent(payload)}`
      : `${BASE_URL}/_serverFn/${id}`;
  const res = await fetch(url, {
    method,
    headers: {
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0",
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...(method === "POST" && payload ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" && payload ? { body: payload } : {}),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, text: await res.text() };
}

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}\n      ${String(detail).slice(0, 200)}`);
  }
}

const login = await call(FN.signIn, { email: EMAIL, password: PASSWORD });
if (!cookie) {
  console.log("could not sign in:", login.status, login.text.slice(0, 200));
  process.exitCode = 1;
  throw new Error('sign-in failed');
}
console.log("signed in as demo-free\n");

const usage = await call(FN.getCoachUsage, undefined, "GET");
console.log(`coach usage seen by the learner: ${usage.text.slice(0, 200)}\n`);

/* ---- 1. No practice item named at all: scoring must not be reachable ---- */
check(
  "analysePronunciation with no sound/lesson/test/sentence id is refused",
  (await call(FN.analysePronunciation, { target: "cut", transcript: "cut", lang: "en" })).text.includes(
    "Choose one sound, lesson, test or sentence to practise",
  ),
  "not refused",
);
check(
  "analyseSpeaking with no test/word id is refused",
  (
    await call(FN.analyseSpeaking, { question: "Tell me about your home.", transcript: "I live in a flat.", lang: "en", level: "B1" })
  ).text.includes("Choose one test or one word to practise with"),
  "not refused",
);

/* ---- 2. Locked items are refused, per feature ---- */
const lockedSound = await call(FN.analysePronunciation, { target: "cut", targetSound: "/ʌ/", transcript: "cut", lang: "en" });
check("Pronunciation: sound #4 of 44 (past the 3 free) is refused", lockedSound.text.includes("UPGRADE_REQUIRED"), lockedSound.text);

const lockedLesson = await call(FN.analysePronunciation, {
  target: DATA.lockedLessonItem,
  lessonId: DATA.lockedLesson,
  transcript: "x",
  lang: "en",
});
check("Advanced examples: a locked lesson example is refused", lockedLesson.text.includes("UPGRADE_REQUIRED"), lockedLesson.text);

const lockedSentence = await call(FN.analysePronunciation, {
  target: "anything",
  sentenceId: DATA.lockedSentence,
  transcript: "x",
  lang: "en",
});
check("Shadowing: a locked sentence is refused", lockedSentence.text.includes("UPGRADE_REQUIRED"), lockedSentence.text);

const lockedTestSpeak = await call(FN.analyseSpeaking, {
  testId: DATA.lockedTest,
  question: DATA.lockedTestQuestion,
  transcript: "I do.",
  lang: "en",
  level: "B1",
});
check("Speaking Tests: test #4+ is refused (analyseSpeaking)", lockedTestSpeak.text.includes("UPGRADE_REQUIRED"), lockedTestSpeak.text);

const lockedTestIelts = await call(FN.evaluateIelts, {
  testId: DATA.lockedTest,
  part: 1,
  question: DATA.lockedTestQuestion,
  transcript: "I do.",
  lang: "en",
});
check("Speaking Tests: test #4+ is refused (evaluateIelts)", lockedTestIelts.text.includes("UPGRADE_REQUIRED"), lockedTestIelts.text);

const lockedWordSpeak = await call(FN.analyseSpeaking, {
  wordId: DATA.lockedWord,
  question: "anything",
  transcript: "I manage a team.",
  lang: "en",
  level: "B1",
});
check("Vocabulary: word #11+ of a topic is refused", lockedWordSpeak.text.includes("UPGRADE_REQUIRED"), lockedWordSpeak.text);

/* ---- 3. A free item's id must not unlock another item's content ---- */
const mixedSound = await call(FN.analysePronunciation, { target: "cut", targetSound: "/ɪ/", transcript: "cut", lang: "en" });
check(
  "free sound id + a locked sound's word is refused",
  mixedSound.text.includes("doesn't belong to this exercise"),
  mixedSound.text,
);

const mixedTest = await call(FN.analyseSpeaking, {
  testId: DATA.freeTest,
  question: DATA.lockedTestQuestion,
  transcript: "I do.",
  lang: "en",
  level: "B1",
});
check("free test id + a locked test's question is refused", mixedTest.text.includes("doesn't belong to this exercise"), mixedTest.text);

/* ---- 4. Progress/score writes are gated too ---- */
const lockedProgress = await call(FN.saveShadowingProgress, {
  sentenceId: DATA.lockedSentence,
  attempts: 1,
  clearAttempts: 1,
  bestAccuracy: 100,
  lastAccuracy: 100,
  status: "mastered",
  secondsPractised: 5,
});
check("saving progress on a locked sentence is refused", lockedProgress.text.includes("UPGRADE_REQUIRED"), lockedProgress.text);

const lockedPractice = await call(FN.recordVocabularyPractice, { wordId: DATA.lockedWord2 });
check("recording practice on a locked word is refused", lockedPractice.text.includes("UPGRADE_REQUIRED"), lockedPractice.text);

const lockedScore = await call(FN.updatePronunciationSoundScore, { sound: "/ʌ/", accuracy: 95 });
check("saving a score for a locked sound is refused", lockedScore.text.includes("UPGRADE_REQUIRED"), lockedScore.text);

/* ---- 5. Locked content must not be readable ---- */
const translations = await call(FN.getVocabularyTranslations, { locale: "vi", wordIds: [DATA.lockedWord, DATA.lockedWord2] }, "GET");
check(
  "locked words' meanings are not returned",
  !translations.text.includes("meaning") || /"a":\s*\[\s*\]/.test(translations.text),
  translations.text,
);

const catalogue = await call(FN.getContentCatalogue, { kind: "vocabulary" }, "GET");
check(
  "locked words' text is not in the catalogue",
  !catalogue.text.includes('"employee"') && !catalogue.text.includes('"manager"'),
  catalogue.text.slice(0, 200),
);

/* ---- 6. The AI Coach's 3 free turns (this account has used all 3) ---- */
const coach = await call(FN.coachReply, { sessionId: DATA.coachSession, transcript: "I went to the park yesterday.", lang: "en" });
check(
  "coachReply past the 3 free turns is refused",
  coach.text.includes("UPGRADE_REQUIRED") || coach.text.includes("free speaking turns"),
  coach.text,
);

/* ---- 7. Not over-blocking: a free item still works end to end ---- */
const allowed = await call(FN.analysePronunciation, { target: "sit", targetSound: "/ɪ/", transcript: "sit", lang: "en" });
check(
  "a free sound's own word is still scored normally",
  !allowed.text.includes("UPGRADE_REQUIRED") && !allowed.text.includes("doesn't belong") && allowed.text.includes("feedback"),
  allowed.text,
);

console.log(`\n${pass} passed, ${fail} failed`);

if (fail > 0) process.exitCode = 1;
