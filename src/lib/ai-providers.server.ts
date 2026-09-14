/**
 * AI PROVIDER ABSTRACTION LAYER
 * ------------------------------------------------------------------
 * Every AI capability the platform uses is defined here behind a small
 * interface so a provider can be swapped without touching feature code.
 *
 * Capabilities: llm | stt (speech-to-text) | tts (text-to-speech) |
 *               pronunciation (acoustic scoring)
 *
 * Per Ràng buộc 2 of the client spec, this platform only ever uses services
 * the client holds its own key for — Gemini and DeepSeek — never a
 * third-party all-in-one AI gateway. Provider selection is config-driven
 * (env vars), not code — flip it and restart, nothing else needs to change:
 *   AI_TEXT_PROVIDER  = gemini | deepseek (default)   -> llmComplete
 *   AI_AUDIO_PROVIDER = gemini (the only option)        -> transcribe / synthesise / analysePronunciationAudio
 * DeepSeek is text-only (no audio API), so it's not a valid AI_AUDIO_PROVIDER value.
 *
 * `pronunciation` (a calibrated, certified acoustic pronunciation score, the
 * kind Azure Speech Pronunciation Assessment / SpeechAce / ELSA provide) has
 * no provider connected on purpose. This was an open question in the spec
 * (Vấn đề 5 — "mức độ chấm phát âm": recognition-based vs. a dedicated
 * acoustic-scoring API), resolved 2026-09-13 in favour of staying on
 * Gemini/DeepSeek only — not something Ràng buộc 2 itself mandates (that
 * constraint is just the task→provider allocation table, it says nothing
 * about acoustic scoring). So this reports `connected: false` and the UI
 * labels scores as DEMO. Gemini still gives its own genuinely audio-grounded
 * 0-100 pronunciation score plus qualitative feedback (see
 * analysePronunciationAudio) — a real AI judgement, just not a lab-calibrated
 * phonetic measurement.
 */

const DEEPSEEK_BASE = "https://api.deepseek.com";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type Capability = "llm" | "stt" | "tts" | "pronunciation";
export type TextProvider = "gemini" | "deepseek";
export type AudioProvider = "gemini";

export type ProviderStatus = {
  capability: Capability;
  provider: string;
  connected: boolean;
  requires?: string;
  note?: string;
};

export class AiNotConnectedError extends Error {
  capability: Capability;
  requires: string;
  constructor(capability: Capability, requires: string) {
    super(`AI capability "${capability}" is not connected. Required: ${requires}`);
    this.capability = capability;
    this.requires = requires;
  }
}

/* --------------------------- provider selection --------------------------- */

function geminiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"];
}
function deepseekKey(): string | undefined {
  return process.env["DEEPSEEK_API_KEY"];
}

export function currentTextProvider(): TextProvider {
  return (process.env["AI_TEXT_PROVIDER"] ?? "").trim().toLowerCase() === "gemini" ? "gemini" : "deepseek";
}

/** Gemini is the only audio provider — kept as a function (not a constant)
 * so callers read intent ("current audio provider") rather than assuming. */
export function currentAudioProvider(): AudioProvider {
  return "gemini";
}

/** Default (env-overridable) model ids per provider. */
function geminiLlmModel(): string {
  return process.env["GEMINI_LLM_MODEL"] ?? "gemini-flash-latest";
}
function deepseekLlmModel(): string {
  return process.env["DEEPSEEK_LLM_MODEL"] ?? "deepseek-chat";
}
function geminiTtsModel(): string {
  return process.env["GEMINI_TTS_MODEL"] ?? "gemini-2.5-flash-preview-tts";
}

/** For usage-log display — "what model actually served this request". */
export function currentLlmModel(): string {
  return currentTextProvider() === "gemini" ? geminiLlmModel() : deepseekLlmModel();
}
export function currentSttModel(): string {
  return geminiLlmModel();
}
export function currentTtsModel(): string {
  return geminiTtsModel();
}

const DISPLAY_NAME: Record<TextProvider | AudioProvider, string> = {
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
};
const REQUIRES_TEXT: Record<TextProvider, string> = {
  gemini: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export function providerStatuses(): ProviderStatus[] {
  const textProvider = currentTextProvider();
  const textConnected = Boolean(textProvider === "gemini" ? geminiKey() : deepseekKey());
  const audioConnected = Boolean(geminiKey());
  return [
    {
      capability: "llm",
      provider: `${DISPLAY_NAME[textProvider]} (${currentLlmModel()})`,
      connected: textConnected,
      requires: REQUIRES_TEXT[textProvider],
    },
    {
      capability: "stt",
      provider: `${DISPLAY_NAME.gemini} (${currentSttModel()})`,
      connected: audioConnected,
      requires: "GEMINI_API_KEY",
    },
    {
      capability: "tts",
      provider: `${DISPLAY_NAME.gemini} (${currentTtsModel()})`,
      connected: audioConnected,
      requires: "GEMINI_API_KEY",
    },
    {
      capability: "pronunciation",
      provider: "none",
      connected: false,
      requires: "A dedicated pronunciation-scoring API (e.g. Azure Speech Pronunciation Assessment, SpeechAce, ELSA)",
      note: "Kept out of scope by decision on Vấn đề 5 (2026-09-13) — staying on Gemini/DeepSeek only, no dedicated acoustic-scoring API. Gemini gives its own 0-100 pronunciation score plus feedback from actually listening to the recording (see analysePronunciationAudio) — a real AI judgement, just not a lab-calibrated phonetic measurement, so this stays DEMO.",
    },
  ];
}

/* --------------------------- shared byte helpers --------------------------- */

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Wraps raw PCM (as Gemini's TTS returns it) in a minimal 44-byte WAV header. */
function wrapPcmAsWav(pcmBase64: string, sampleRate: number, channels: number, bitsPerSample: number): string {
  const pcm = bytesFromBase64(pcmBase64);
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(header.length + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, header.length);
  return base64FromBytes(wav);
}

/* --------------------------- DeepSeek (OpenAI-shaped) --------------------------- */

async function openaiCompatFail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  if (res.status === 429) throw new Error("Lingora English is busy right now. Please wait a moment and try again.");
  if (res.status === 402)
    throw new Error("The AI workspace is out of credits. Please top up AI credits to keep practising.");
  if (res.status === 403) throw new Error("AI access is blocked by workspace policy.");
  throw new Error(`AI request failed (${res.status}). ${body.slice(0, 300)}`);
}

type OpenAiCompatResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function openaiCompatComplete(
  cfg: { fetchImpl: (body: unknown) => Promise<Response>; requires: string; key: string | undefined },
  opts: { maxTokens?: number; json?: boolean },
  body: { model: string; messages: ChatMessage[] },
): Promise<LlmResult> {
  if (!cfg.key) throw new AiNotConnectedError("llm", cfg.requires);
  const res = await cfg.fetchImpl({
    model: body.model,
    messages: body.messages,
    max_tokens: opts.maxTokens ?? 700,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  if (!res.ok) await openaiCompatFail(res);
  const data = (await res.json()) as OpenAiCompatResponse;
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    truncated: data.choices?.[0]?.finish_reason === "length",
  };
}

async function deepseekLlmComplete(messages: ChatMessage[], opts: { maxTokens?: number; json?: boolean }) {
  const key = deepseekKey();
  return openaiCompatComplete(
    {
      key,
      requires: "DEEPSEEK_API_KEY",
      fetchImpl: (body) =>
        fetch(`${DEEPSEEK_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
        }),
    },
    opts,
    { model: deepseekLlmModel(), messages },
  );
}

/* --------------------------- Google Gemini --------------------------- */

type GeminiGenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

async function geminiFetch(model: string, body: unknown): Promise<Response> {
  const key = geminiKey();
  if (!key) throw new AiNotConnectedError("llm", "GEMINI_API_KEY");
  return fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify(body),
  });
}

async function geminiFail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let status: string | undefined;
  try {
    status = (JSON.parse(body) as { error?: { status?: string } }).error?.status;
  } catch {
    // non-JSON error body — fall through to the generic message below
  }
  if (res.status === 429 || status === "RESOURCE_EXHAUSTED")
    throw new Error("Lingora English is busy right now. Please wait a moment and try again.");
  if (res.status === 403 || status === "PERMISSION_DENIED") throw new Error("AI access is blocked by workspace policy.");
  throw new Error(`AI request failed (${res.status}). ${body.slice(0, 300)}`);
}

/** Gemini has no "system" role in `contents` — system messages go in the separate `systemInstruction` field. */
function toGeminiRequest(
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean },
): Record<string, unknown> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  // Gemini's "thinking" models spend part of maxOutputTokens on invisible reasoning before the visible
  // answer, and thinkingConfig:{thinkingBudget:0} does not reliably bring that to zero (observed ~40-50
  // thinking tokens even with it set) — so a tight budget like our smallest real call (220) can come back
  // empty if we send exactly that number. Pad the budget we actually send Gemini; the public `truncated`
  // behavior callers rely on (llmCompleteWhole's continuation retry) still reflects opts.maxTokens, not
  // this padded value, via the char-based endsCompletely() check rather than finishReason alone mattering.
  const requestedTokens = opts.maxTokens ?? 700;
  return {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
    generationConfig: {
      maxOutputTokens: requestedTokens + 96,
      thinkingConfig: { thinkingBudget: 0 },
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
}

async function geminiLlmComplete(
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean },
): Promise<LlmResult> {
  const res = await geminiFetch(geminiLlmModel(), toGeminiRequest(messages, opts));
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiGenerateResponse;
  const candidate = data.candidates?.[0];
  return {
    text: candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    truncated: candidate?.finishReason === "MAX_TOKENS",
  };
}

async function geminiTranscribe(audio: Uint8Array, mimeType: string): Promise<string> {
  const base = mimeType.split(";")[0] ?? "audio/wav";
  const res = await geminiFetch(geminiLlmModel(), {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: base, data: base64FromBytes(audio) } },
          {
            text: "Transcribe only the clearly audible human speech in this audio. If the audio contains no clear speech — silence, faint noise, breathing, static, or anything you cannot confidently make out — output nothing at all: an empty response. Never invent, guess, or complete words or sentences that are not clearly and actually spoken. Output only the transcript text, no commentary, no quotes.",
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
  });
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiGenerateResponse;
  return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
}

/** Our public voice names mapped to Gemini's prebuilt TTS voice names. */
const GEMINI_VOICE_MAP: Record<string, string> = {
  shimmer: "Kore",
  nova: "Aoede",
  alloy: "Charon",
  coral: "Leda",
  sage: "Puck",
};

async function geminiSynthesise(text: string, voice: string): Promise<{ base64: string; mime: string }> {
  const geminiVoice = GEMINI_VOICE_MAP[voice] ?? "Kore";
  const res = await geminiFetch(geminiTtsModel(), {
    contents: [
      {
        parts: [{ text: `Say in a warm, friendly, cheerful American English teacher voice: ${text}` }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } } },
    },
  });
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiGenerateResponse;
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS returned no audio.");
  // Gemini's native TTS returns raw 16-bit PCM, 24kHz mono — wrap it so it's a playable file.
  return { base64: wrapPcmAsWav(inline.data, 24000, 1, 16), mime: "audio/wav" };
}

/* ------------------------------- LLM (public) ------------------------------- */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmResult = { text: string; inputTokens: number; outputTokens: number; truncated?: boolean };

/** Short prompts + short responses keep AI cost low. */
export async function llmComplete(
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<LlmResult> {
  return currentTextProvider() === "gemini" ? geminiLlmComplete(messages, opts) : deepseekLlmComplete(messages, opts);
}

/** True when the text ends as a finished grammatical unit (no dangling clause). */
export function endsCompletely(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/[.!?…"')\]]$/.test(trimmed)) return false;
  const lastWord = trimmed.replace(/[^A-Za-z\s']+$/g, "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const dangling = new Set([
    "because","and","but","so","which","that","when","if","or","to","for","with","of","the","a","an","while","since","although","as","than","then","also","plus","however",
  ]);
  return !dangling.has(lastWord);
}

/**
 * Runs llmComplete and, if the model was cut off mid-thought, asks it to finish
 * so the caller (and the voice) always gets a complete response.
 */
export async function llmCompleteWhole(
  messages: ChatMessage[],
  opts: { maxTokens?: number } = {},
): Promise<LlmResult> {
  const maxTokens = opts.maxTokens ?? 700;
  const first = await llmComplete(messages, { maxTokens });
  let text = first.text.trim();
  let inputTokens = first.inputTokens;
  let outputTokens = first.outputTokens;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (text && !first.truncated && endsCompletely(text)) break;
    if (!text) break;
    if (endsCompletely(text) && !first.truncated) break;
    const cont = await llmComplete(
      [
        ...messages,
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Continue your previous reply from exactly where it stopped and finish the thought. Output only the missing continuation, no repetition, and end with complete sentences.",
        },
      ],
      { maxTokens },
    );
    const extra = cont.text.trim();
    inputTokens += cont.inputTokens;
    outputTokens += cont.outputTokens;
    if (!extra) break;
    text = `${text}${/[\s]$/.test(text) ? "" : " "}${extra}`.trim();
    if (endsCompletely(text) && !cont.truncated) break;
  }

  // Last resort: drop a trailing incomplete fragment rather than speaking half a sentence.
  if (!endsCompletely(text)) {
    const cut = Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
    if (cut > 20) text = text.slice(0, cut + 1);
  }

  return { text, inputTokens, outputTokens, truncated: false };
}

export async function llmJson<T>(messages: ChatMessage[], maxTokens = 800): Promise<{ value: T } & LlmResult> {
  const result = await llmComplete(messages, { maxTokens, json: true });
  const raw = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const slice = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  try {
    return { value: JSON.parse(slice) as T, ...result };
  } catch {
    throw new Error("Lingora English returned an unexpected response. Please try again.");
  }
}

/* ------------------------- Speech to text (public) ------------------------- */

export async function transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
  if (!geminiKey()) throw new AiNotConnectedError("stt", "GEMINI_API_KEY");
  return geminiTranscribe(audio, mimeType);
}

export type AudioPronunciationFeedback = {
  feedback: string;
  heardClearly: boolean;
  /** Gemini's own 0-100 pronunciation score from actually listening to the
   * recording — a real AI judgement, not a lab-calibrated phonetic
   * measurement. Null if the model didn't return a usable number. */
  score: number | null;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Pronunciation feedback grounded in the actual recording — Gemini listens
 * to it directly, instead of only diffing the speech-to-text transcript
 * against the target text. Meaningfully more informed than the text-only
 * fallback (it can notice things like a missing rising intonation or a
 * sound that came out wrong), but deliberately never asked for a numeric
 * accuracy score: a general-purpose multimodal model isn't a calibrated
 * phonetic scoring engine the way a dedicated service (Azure Speech
 * Pronunciation Assessment, SpeechAce, ELSA) is, and inventing a precise
 * percentage here would be exactly the kind of fake acoustic score this
 * codebase deliberately avoids elsewhere (see analysePronunciation).
 *
 * Returns null if Gemini isn't configured or its response doesn't parse, so
 * the caller can fall back to the transcript-only feedback it already has.
 */
export async function analysePronunciationAudio(
  audio: Uint8Array,
  mimeType: string,
  target: string,
  langNote: string,
): Promise<AudioPronunciationFeedback | null> {
  if (!geminiKey()) return null;
  const base = mimeType.split(";")[0] ?? "audio/wav";
  const res = await geminiFetch(geminiLlmModel(), {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: base, data: base64FromBytes(audio) } },
          {
            text: `Listen to this recording of a learner trying to say: "${target}"
${langNote}
Give honest, specific pronunciation feedback based on what you actually hear in the audio — sounds that were unclear or mispronounced, whether stress and intonation sounded natural, anything a real listener would notice. Also give your own honest overall pronunciation score from 0 to 100 (how close it sounded to a natural, accurate pronunciation of the target) — this is your expert judgement as a listener, not a lab measurement, but still give a specific number rather than refusing to score it. If the recording is silent, too quiet, or unintelligible, say so plainly and score it low instead of guessing generously.
JSON only: {"heard_clearly": true or false, "score": 0-100 integer, "feedback": "max 3 short sentences"}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 350, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
  });
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiGenerateResponse;
  const raw = (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
  try {
    const parsed = JSON.parse(raw) as { heard_clearly?: boolean; score?: number; feedback?: string };
    if (!parsed.feedback) return null;
    const score = typeof parsed.score === "number" && Number.isFinite(parsed.score)
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : null;
    return {
      feedback: parsed.feedback,
      heardClearly: parsed.heard_clearly ?? true,
      score,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch {
    return null;
  }
}

export type IeltsPronunciationFeedback = {
  /** Examiner-style band, 0-9 in 0.5 steps — same criterion an official
   * IELTS examiner scores (individual sounds, word/sentence stress,
   * intonation, chunking), not the 0-100 "how close to this exact target
   * text" score analysePronunciationAudio gives, since IELTS answers are
   * free-form with no fixed script to match against. Null if the model
   * didn't return a usable number. */
  band: number | null;
  feedback: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * IELTS Speaking "Pronunciation" criterion, scored by Gemini listening to
 * the candidate's actual answer — the fourth official band criterion
 * (alongside Fluency & Coherence, Lexical Resource, Grammatical Range &
 * Accuracy), which the text-only evaluateIelts call deliberately never
 * scores since it only sees a transcript. Same "real AI judgement, not a
 * lab-calibrated phonetic measurement" caveat as analysePronunciationAudio.
 * Returns null if Gemini isn't configured or its response doesn't parse, so
 * the caller can leave pronunciation unscored rather than guessing.
 */
export async function analyseIeltsPronunciationAudio(
  audio: Uint8Array,
  mimeType: string,
  langNote: string,
): Promise<IeltsPronunciationFeedback | null> {
  if (!geminiKey()) return null;
  const base = mimeType.split(";")[0] ?? "audio/wav";
  const res = await geminiFetch(geminiLlmModel(), {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: base, data: base64FromBytes(audio) } },
          {
            text: `Listen to this IELTS Speaking candidate's answer and judge only their Pronunciation, the way an official IELTS examiner would: individual sounds, word stress, sentence stress, intonation, and chunking (grouping words into natural phrases). Ignore content, grammar and vocabulary — only how it sounds.
${langNote}
Give an honest band score from 0 to 9 in 0.5 steps (a whole 9 should be rare — only when pronunciation is effortless throughout with only occasional non-native slips), plus specific feedback on what you actually heard. If the recording is silent, too quiet, or unintelligible, say so plainly and score it low instead of guessing generously.
JSON only: {"band": 0-9 in steps of 0.5, "feedback": "max 3 short sentences"}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 350, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
  });
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiGenerateResponse;
  const raw = (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
  try {
    const parsed = JSON.parse(raw) as { band?: number; feedback?: string };
    if (!parsed.feedback) return null;
    const band = typeof parsed.band === "number" && Number.isFinite(parsed.band)
      ? Math.max(0, Math.min(9, Math.round(parsed.band * 2) / 2))
      : null;
    return {
      band,
      feedback: parsed.feedback,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch {
    return null;
  }
}

/* ------------------------- Text to speech (public) ------------------------- */

export const LILY_VOICES = ["shimmer", "nova", "alloy", "coral", "sage"] as const;
export type LilyVoice = (typeof LILY_VOICES)[number];

/** Returns base64 WAV audio. Callers cache the result so audio is generated once. */
export async function synthesise(text: string, voice: string): Promise<{ base64: string; mime: string }> {
  if (!geminiKey()) throw new AiNotConnectedError("tts", "GEMINI_API_KEY");
  return geminiSynthesise(text, voice);
}
