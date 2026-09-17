import { llmJson, type ChatMessage } from "./ai-providers.server";
import { langNote } from "./explanation-language";
import type { SpeakingAnalysis } from "./lily.functions";

/** The one grammar/vocabulary/fluency scoring prompt, shared by
 * analyseSpeaking (Speaking Tests, Vocabulary) and coachReply (AI Coach), so
 * the Coach can score a turn server-side inside the same request that spends
 * the turn instead of exposing a second, un-metered endpoint for it. */
export async function analyseSpeakingTranscript(input: {
  question: string;
  transcript: string;
  level: string;
  lang: string;
}) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are Lingora English, a warm, patient, encouraging female English teacher. Score honestly but kindly. ${langNote(input.lang)}
Return JSON only:
{"fluency":0-10,"grammar":0-10,"vocabulary":0-10,"overall":0-10,"mistakes":[{"wrong":"","why":""}],"corrections":[{"from":"","to":""}],"better_vocabulary":[{"instead_of":"","use":""}],"natural_answer":"","feedback":""}
Max 4 items per array. feedback: max 3 short sentences. Do NOT score pronunciation — you only see a transcript.`,
    },
    {
      role: "user",
      content: `Level: ${input.level}\nQuestion: ${input.question}\nStudent (speech-to-text): ${input.transcript}`,
    },
  ];
  return llmJson<SpeakingAnalysis>(messages, 900);
}
