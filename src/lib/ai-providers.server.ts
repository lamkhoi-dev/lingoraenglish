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

/** Every key configured for a provider: `<BASE>_API_KEYS` plus the single `<BASE>_API_KEY`. Keys may be separated by
 * commas, semicolons, spaces or newlines, so pasting several keys into one variable still works. */
function keyPool(base: "GEMINI" | "GROQ" | "DEEPSEEK"): string[] {
  const raw = [process.env[`${base}_API_KEYS`], process.env[`${base}_API_KEY`]].filter(Boolean).join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];
}
function geminiKey(): string | undefined {
  return keyPool("GEMINI")[0];
}
function deepseekKey(): string | undefined {
  return keyPool("DEEPSEEK")[0];
}

/* ------------------------ circuit breaker (per key / model) ------------------------ */

/** In-memory "do not call this until" map. A key or model that just answered 402/429/5xx is skipped
 * for a while, so later requests go straight to the next key/model/provider instead of each one
 * waiting through the same failure. Resets on restart, which is fine: one failed call re-learns it. */
const pausedUntil = new Map<string, number>();

function isPaused(id: string): boolean {
  const until = pausedUntil.get(id);
  if (!until) return false;
  if (until <= Date.now()) {
    pausedUntil.delete(id);
    return false;
  }
  return true;
}
function pause(id: string, ms: number, why: string): void {
  pausedUntil.set(id, Date.now() + ms);
  console.warn(`[ai] ${id} paused for ${Math.round(ms / 1000)}s - ${why}`);
}

/** What a failed provider response means for rotation: which scope to pause and for how long.
 * Returns null for errors that rotating cannot fix (bad request etc.) so the caller reports them. */
function classifyFailure(status: number, body: string): { scope: "key" | "model"; ms: number; why: string } | null {
  if (status === 402) return { scope: "key", ms: 2 * 60_000, why: "credits depleted (402)" };
  if (status === 401) return { scope: "key", ms: 10 * 60_000, why: "invalid API key (401)" };
  if (status === 403) return { scope: "key", ms: 10 * 60_000, why: "access denied (403)" };
  if (status === 429) {
    const daily = /per.?day|daily|PerDay/i.test(body);
    return { scope: "model", ms: daily ? 30 * 60_000 : 60_000, why: daily ? "daily quota (429)" : "rate limited (429)" };
  }
  if (status === 404) return { scope: "model", ms: 24 * 60 * 60_000, why: "model not available (404)" };
  if (status >= 500) return { scope: "model", ms: 20_000, why: `provider error (${status})` };
  return null;
}

/** Comma-separated order override, e.g. AI_TTS_ORDER="gemini,groq"; unknown names are ignored. */
function providerOrder<T extends string>(envName: string, defaults: readonly T[]): T[] {
  const wanted = (process.env[envName] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is T => (defaults as readonly string[]).includes(s));
  return wanted.length ? [...new Set(wanted)] : [...defaults];
}

/** Models actually served last, so usage logs name the model that did the work after a fallback. */
const lastServed = { tts: "", stt: "" };

export function currentTextProvider(): TextProvider {
  return (process.env["AI_TEXT_PROVIDER"] ?? "").trim().toLowerCase() === "gemini" ? "gemini" : "deepseek";
}

/** Gemini is the only audio provider — kept as a function (not a constant)
 * so callers read intent ("current audio provider") rather than assuming. */
export function currentAudioProvider(): AudioProvider {
  return "gemini";
}

/** The one place the ttsCache key formula lives. `speak()` and the
 * admin-only sound-audio save path both need to land on the exact same key
 * for a given voice+text — if they ever drifted, an admin-approved clip
 * would silently never be seen by students (or vice versa). */
export function ttsCacheKey(voice: string, text: string): string {
  return `${currentAudioProvider()}::${voice}::${text.trim().toLowerCase()}`;
}

/** Default (env-overridable) model ids per provider. */
function geminiLlmModel(): string {
  return process.env["GEMINI_LLM_MODEL"] ?? "gemini-flash-latest";
}
function deepseekLlmModel(): string {
  return process.env["DEEPSEEK_LLM_MODEL"] ?? "deepseek-chat";
}
/** Gemini TTS models, cheapest first (list prices per 1M audio tokens: 2.5 Flash $10, 3.1 Flash $20). A model that is
 * rate-limited is paused by geminiFetch and the next one is used. Override the whole list with GEMINI_TTS_MODELS
 * (comma-separated); GEMINI_TTS_MODEL, if set, is tried after the defaults.
 *
 * Deliberately NOT in the defaults: gemini-3.8-flash-lite-tts and gemini-3.8-flash-tts. They are cheaper ($6 / $9) but
 * every clip ends with ~140ms of loud steady noise (75-100% of the speech peak) - the "xẹt" learners heard after each
 * sentence (measured 2026-10-02; 2.5 Flash and 3.1 Flash end cleanly). Re-test before adding them back. */
const DEFAULT_GEMINI_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];
function geminiTtsModelChain(): string[] {
  const custom = (process.env["GEMINI_TTS_MODELS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const legacy = process.env["GEMINI_TTS_MODEL"]?.trim();
  return [...new Set([...(custom.length ? custom : DEFAULT_GEMINI_TTS_MODELS), ...(legacy ? [legacy] : [])])];
}
/** Gemini models that can hear audio, cheapest first (used for transcription when Groq is unavailable). */
function geminiAudioModelChain(): string[] {
  const custom = (process.env["GEMINI_STT_MODELS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...(custom.length ? custom : ["gemini-flash-lite-latest"]), geminiLlmModel()])];
}

/** For usage-log display — "what model actually served this request". */
export function currentLlmModel(): string {
  return currentTextProvider() === "gemini" ? geminiLlmModel() : deepseekLlmModel();
}
export function currentSttModel(): string {
  return lastServed.stt || (keyPool("GROQ").length ? groqSttModel() : (geminiAudioModelChain()[0] ?? geminiLlmModel()));
}
export function currentTtsModel(): string {
  return lastServed.tts || (geminiTtsModelChain()[0] ?? "gemini-3.8-flash-lite-tts");
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

/** Wraps raw PCM (as Gemini's TTS returns it) in a clean 44-byte WAV header,
 * applying a smooth fade-in and fade-out to eliminate pops, clicks, or scratch noise at the end. */
function wrapPcmAsWav(pcmBase64: string, sampleRate: number, channels: number, bitsPerSample: number): string {
  const rawPcm = bytesFromBase64(pcmBase64);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(rawPcm.length / bytesPerSample);
  const validPcmLength = numSamples * bytesPerSample;
  const pcm = new Uint8Array(rawPcm.buffer, rawPcm.byteOffset, validPcmLength);
  const pcmView = new DataView(pcm.buffer, pcm.byteOffset, validPcmLength);

  // Smooth fade-in (5ms) to eliminate any leading DC click
  const fadeInSamples = Math.min(Math.floor(sampleRate * 0.005), numSamples);
  for (let i = 0; i < fadeInSamples; i += 1) {
    const factor = 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples));
    const val = pcmView.getInt16(i * 2, true);
    pcmView.setInt16(i * 2, Math.round(val * factor), true);
  }

  // Smooth fade-out (40ms) to eliminate trailing pop, crackle, or static
  const fadeOutSamples = Math.min(Math.floor(sampleRate * 0.04), numSamples);
  const startFade = numSamples - fadeOutSamples;
  for (let i = 0; i < fadeOutSamples; i += 1) {
    const factor = 0.5 * (1 + Math.cos((Math.PI * i) / fadeOutSamples));
    const idx = (startFade + i) * 2;
    const val = pcmView.getInt16(idx, true);
    pcmView.setInt16(idx, Math.round(val * factor), true);
  }

  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + validPcmLength, true);
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
  view.setUint32(40, validPcmLength, true);
  const wav = new Uint8Array(header.length + validPcmLength);
  wav.set(header, 0);
  wav.set(pcm, header.length);
  return base64FromBytes(wav);
}

const WAV_HEADER_BYTES = 44;
/** Every clip synthesise() returns is 24kHz mono 16-bit PCM in a WAV wrapper
 * (see wrapPcmAsWav above) — fixed, not per-call config, so two clips are
 * always byte-compatible to splice together. */
const PCM_SAMPLE_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;

/**
 * Joins two already-synthesised WAV clips (as returned by synthesise/
 * geminiSynthesise) into one WAV, with a short silence gap between them.
 * Used to build one Sounds-drill clip out of two separately-generated
 * halves: the isolated "âm" (sound) part, read via a different prompt
 * technique than plain text (see adminGenerateSoundTake), and the "từ-câu"
 * (word + sentence) part, read as ordinary text — each far more reliable
 * generated on its own than as one combined prompt would be.
 */
export function concatWavClips(wavBase64A: string, wavBase64B: string, silenceMs = 300): string {
  const pcmA = bytesFromBase64(wavBase64A).slice(WAV_HEADER_BYTES);
  const pcmB = bytesFromBase64(wavBase64B).slice(WAV_HEADER_BYTES);
  const bytesPerSample = PCM_BITS_PER_SAMPLE / 8;
  const silenceBytes = Math.round((PCM_SAMPLE_RATE * silenceMs) / 1000) * bytesPerSample;
  const combined = new Uint8Array(pcmA.length + silenceBytes + pcmB.length);
  combined.set(pcmA, 0);
  // silenceBytes region is already zero-filled by `new Uint8Array`.
  combined.set(pcmB, pcmA.length + silenceBytes);
  // Re-wrap (not just re-header) so the join point and the very start/end of
  // the combined clip all get wrapPcmAsWav's fade-in/out treatment.
  return wrapPcmAsWav(base64FromBytes(combined), PCM_SAMPLE_RATE, PCM_CHANNELS, PCM_BITS_PER_SAMPLE);
}

/* --------------------------- DeepSeek (OpenAI-shaped) --------------------------- */

/** An HTTP failure from a text/audio AI provider. Carries the status so llmComplete() can decide whether
 * to move on to the next provider (402/429/5xx) or report the error (e.g. a bad request). */
class ProviderHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function openaiCompatFail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  if (res.status === 429)
    throw new ProviderHttpError(429, "Lingora English is busy right now. Please wait a moment and try again.");
  if (res.status === 402) {
    console.error("[ai] a text provider answered 402 (out of credits) - top up that account.");
    throw new ProviderHttpError(402, "The AI workspace is out of credits. Please top up AI credits to keep practising.");
  }
  if (res.status === 403) throw new ProviderHttpError(403, "AI access is blocked by workspace policy.");
  throw new ProviderHttpError(res.status, `AI request failed (${res.status}). ${body.slice(0, 300)}`);
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

/** Calls Gemini with the first usable key. A key that is out of credits (402), rate-limited (429) or
 * erroring is paused and the next key is tried; the last failing response is returned if none work,
 * so callers keep their existing `!res.ok` handling. */
async function geminiFetch(model: string, body: unknown): Promise<Response> {
  const keys = keyPool("GEMINI");
  if (!keys.length) throw new AiNotConnectedError("llm", "GEMINI_API_KEY");
  const payload = JSON.stringify(body);
  let last: Response | undefined;
  for (let i = 0; i < keys.length; i += 1) {
    const keyId = `gemini#${i}`;
    const modelId = `gemini#${i}:${model}`;
    if (isPaused(keyId) || isPaused(modelId)) continue;
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": keys[i]! },
      body: payload,
    });
    if (res.ok) return res;
    const failure = classifyFailure(res.status, await res.clone().text().catch(() => ""));
    if (!failure) return res;
    pause(failure.scope === "key" ? keyId : modelId, failure.ms, `${model}: ${failure.why}`);
    lastGeminiFailureStatus = res.status;
    last = res;
  }
  // Every key/model is paused (or just failed): answer with the same failure kind without hitting Google again.
  return (
    last ??
    new Response(
      JSON.stringify({
        error: { code: lastGeminiFailureStatus, status: "RESOURCE_EXHAUSTED", message: "All Gemini keys are paused." },
      }),
      { status: lastGeminiFailureStatus },
    )
  );
}
let lastGeminiFailureStatus = 429;

async function geminiFail(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let status: string | undefined;
  try {
    status = (JSON.parse(body) as { error?: { status?: string } }).error?.status;
  } catch {
    // non-JSON error body — fall through to the generic message below
  }
  // 402 is the prepaid balance running out, not a rate limit — name it so the real cause shows in the logs.
  if (res.status === 402) {
    console.error("[ai] Gemini credits depleted (402) - top up the Gemini API account.");
    throw new ProviderHttpError(402, "Lingora English's AI is temporarily unavailable. Please try again in a few minutes.");
  }
  if (res.status === 429 || status === "RESOURCE_EXHAUSTED")
    throw new ProviderHttpError(429, "Lingora English is busy right now. Please wait a moment and try again.");
  if (res.status === 503 || status === "UNAVAILABLE")
    throw new ProviderHttpError(503, "Hệ thống AI đang quá tải tạm thời từ phía Google. Vui lòng bấm thử lại sau vài giây.");
  if (res.status === 403 || status === "PERMISSION_DENIED")
    throw new ProviderHttpError(403, "AI access is blocked by workspace policy.");
  throw new ProviderHttpError(res.status, `AI request failed (${res.status}). ${body.slice(0, 300)}`);
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
  let lastFailure: Response | undefined;
  for (const model of geminiAudioModelChain()) {
    const res = await geminiTranscribeWith(model, audio, mimeType);
    if (res.ok) {
      lastServed.stt = model;
      const data = (await res.json()) as GeminiGenerateResponse;
      return (data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "").trim();
    }
    lastFailure = res;
    // Rate limited / unavailable / unknown model: try the next model. Anything else (e.g. 402) is final.
    if (![404, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  return geminiFail(lastFailure!);
}

async function geminiTranscribeWith(model: string, audio: Uint8Array, mimeType: string): Promise<Response> {
  const base = mimeType.split(";")[0] ?? "audio/wav";
  return geminiFetch(model, {
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
}

/** Our public voice names mapped to Gemini's prebuilt TTS voice names. */
const GEMINI_VOICE_MAP: Record<string, string> = {
  shimmer: "Kore",
  nova: "Aoede",
  alloy: "Charon",
  coral: "Leda",
  sage: "Puck",
};

function cleanTextForTts(rawText: string): string {
  return rawText
    // Remove markdown bold / italic / strikethrough: **text**, *text*, _text_
    .replace(/[*_~`#]/g, "")
    // Remove bracketed stage directions like [laughter], (laughs), [pause]
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    // Normalize curly quotes and dashes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, ", ")
    // Normalize multiple spaces / newlines
    .replace(/\s+/g, " ")
    .trim();
}

async function geminiSynthesise(text: string, voice: string): Promise<{ base64: string; mime: string }> {
  const geminiVoice = GEMINI_VOICE_MAP[voice] ?? "Kore";
  const clean = cleanTextForTts(text) || text.trim() || "...";
  const uniqueModels = geminiTtsModelChain();

  let lastError: unknown;
  for (const model of uniqueModels) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await geminiFetch(model, {
          contents: [
            {
              parts: [{ text: clean }],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } } },
          },
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          let errStatus: string | undefined;
          let errMsg: string | undefined;
          try {
            const parsed = JSON.parse(body) as { error?: { status?: string; message?: string } };
            errStatus = parsed.error?.status;
            errMsg = parsed.error?.message;
          } catch {
            // non-JSON error body
          }

          if (res.status === 404) {
            lastError = new Error(`Model ${model} not available (404)`);
            break;
          }

          // Out of credits on every Gemini key: no other Gemini model can work either, so stop here and
          // let synthesise() move on to the next provider.
          if (res.status === 402) {
            console.error("[ai] Gemini TTS: credits depleted (402) on every key.");
            throw new Error("Gemini credits depleted (402).");
          }

          // Rate limited: geminiFetch already paused this model for a while, so go straight to the
          // next (cheapest-first) model instead of sleeping and retrying the same one.
          if (res.status === 429 || errStatus === "RESOURCE_EXHAUSTED") {
            lastError = new Error("Hệ thống AI đang quá tải tạm thời (Rate Limit). Vui lòng thử lại sau vài giây.");
            break;
          }

          if (res.status === 503 || res.status === 500 || errStatus === "UNAVAILABLE") {
            lastError = new Error("Dịch vụ Google AI tạm thời bận. Đang thử lại...");
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
            break;
          }

          throw new Error(`Gemini TTS API error (${res.status}): ${errMsg || body.slice(0, 200)}`);
        }

        const data = (await res.json()) as GeminiGenerateResponse;
        const candidate = data.candidates?.[0];
        const inline = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData;

        if (!inline?.data) {
          const finishReason = candidate?.finishReason ?? "NO_DATA";
          lastError = new Error(`Gemini TTS did not return audio data (finishReason: ${finishReason}).`);
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break;
        }

        // Gemini's native TTS returns raw 16-bit PCM, 24kHz mono — wrap it so it's a playable file.
        lastServed.tts = model;
        return { base64: wrapPcmAsWav(inline.data, 24000, 1, 16), mime: "audio/wav" };
      } catch (err) {
        lastError = err;
        if (err instanceof Error && err.message.includes("(402)")) throw err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error("Gemini TTS returned no audio.");
}

/* ------------------------------- LLM (public) ------------------------------- */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmResult = { text: string; inputTokens: number; outputTokens: number; truncated?: boolean };

/** Short prompts + short responses keep AI cost low. */
export async function llmComplete(
  messages: ChatMessage[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<LlmResult> {
  type TextProviderName = "deepseek" | "gemini" | "groq";
  // Default order: the configured primary (AI_TEXT_PROVIDER) first, then the others as fallbacks.
  const primary: TextProviderName = currentTextProvider();
  const defaults = [primary, ...(["deepseek", "gemini", "groq"] as const).filter((p) => p !== primary)];
  const order = providerOrder("AI_TEXT_ORDER", defaults as readonly TextProviderName[]);

  const run = (provider: TextProviderName) =>
    provider === "deepseek"
      ? deepseekLlmComplete(messages, opts)
      : provider === "gemini"
        ? geminiLlmComplete(messages, opts)
        : groqLlmComplete(messages, opts);
  const hasKey = (provider: TextProviderName) =>
    keyPool(provider === "deepseek" ? "DEEPSEEK" : provider === "gemini" ? "GEMINI" : "GROQ").length > 0;

  let lastError: unknown;
  // Pass 1 skips providers that recently failed; if that leaves nothing to try, pass 2 tries them anyway.
  for (const respectPause of [true, false]) {
    let attempted = false;
    for (const provider of order) {
      if (!hasKey(provider) || (respectPause && isPaused(`llm:${provider}`))) continue;
      attempted = true;
      try {
        return await run(provider);
      } catch (err) {
        lastError = err;
        const status = err instanceof ProviderHttpError ? err.status : 0;
        const failure = status ? classifyFailure(status, "") : status === 0 && !(err instanceof AiNotConnectedError) ? { ms: 20_000, why: "request failed" } : null;
        if (!failure) throw err; // e.g. a 400: the same prompt would fail on the next provider too
        pause(`llm:${provider}`, failure.ms, failure.why);
      }
    }
    if (attempted) break;
  }
  if (lastError) throw lastError;
  throw new AiNotConnectedError("llm", "DEEPSEEK_API_KEY, GEMINI_API_KEY or GROQ_API_KEY");
}

/** Groq's OpenAI-compatible chat endpoint. Used as the last text fallback; the model is small and cheap. */
async function groqLlmComplete(messages: ChatMessage[], opts: { maxTokens?: number; json?: boolean }): Promise<LlmResult> {
  const keys = keyPool("GROQ");
  const model = process.env["GROQ_LLM_MODEL"] ?? "openai/gpt-oss-20b";
  let lastError: unknown = new Error("Groq chat is busy right now.");
  for (let k = 0; k < keys.length; k += 1) {
    const keyId = `groq#${k}`;
    const modelId = `groq#${k}:${model}`;
    if (isPaused(keyId) || isPaused(modelId)) continue;
    try {
      return await openaiCompatComplete(
        {
          key: keys[k],
          requires: "GROQ_API_KEY",
          fetchImpl: (body) =>
            fetch(`${GROQ_BASE}/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys[k]}` },
              // gpt-oss "reasons" before answering and that thinking counts against max_tokens, so keep it
              // short and leave headroom for the visible reply.
              body: JSON.stringify({ ...(body as object), reasoning_effort: "low" }),
            }),
        },
        { ...opts, maxTokens: (opts.maxTokens ?? 700) + 300 },
        { model, messages },
      );
    } catch (err) {
      lastError = err;
      const failure = err instanceof ProviderHttpError ? classifyFailure(err.status, "") : null;
      if (!failure) throw err;
      pause(failure.scope === "key" ? keyId : modelId, failure.ms, `${model}: ${failure.why}`);
    }
  }
  throw lastError;
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

/** Speech to text. Providers are tried in AI_STT_ORDER (default "groq,gemini"): Groq Whisper is the
 * cheapest, Gemini is the fallback. The first provider that answers wins; if all fail, the last error is
 * thrown so the learner sees one clear message. */
export async function transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
  let lastError: unknown;
  let tried = false;
  for (const provider of providerOrder("AI_STT_ORDER", ["groq", "gemini"] as const)) {
    try {
      if (provider === "groq" && keyPool("GROQ").length) {
        tried = true;
        return await groqTranscribe(audio, mimeType);
      }
      if (provider === "gemini" && keyPool("GEMINI").length) {
        tried = true;
        return await geminiTranscribe(audio, mimeType);
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (!tried) throw new AiNotConnectedError("stt", "GROQ_API_KEY or GEMINI_API_KEY");
  throw lastError;
}

/* --------------------------- Groq STT (Whisper) --------------------------- */

function groqSttModel(): string {
  return process.env["GROQ_STT_MODEL"] ?? "whisper-large-v3-turbo";
}
function audioFileExtension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("flac")) return "flac";
  return "wav";
}

/** Whisper's well-known inventions on silence/noise. Dropped so the learner sees "couldn't hear you" instead. */
const WHISPER_PHANTOM_PHRASES = new Set([
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "subscribe to my channel",
  "you",
]);

const WHISPER_LONG_CLIP_PHANTOMS = new Set(["thank you", "thanks", "bye", "okay"]);

type GroqWhisperResponse = {
  text?: string;
  duration?: number;
  segments?: { text?: string; no_speech_prob?: number; avg_logprob?: number }[];
};

/** Groq Whisper models, cheapest first. Each model has its own request/audio-second quota on Groq, so
 * when one is rate-limited the other still has headroom. */
function groqSttModelChain(): string[] {
  const custom = (process.env["GROQ_STT_MODELS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...(custom.length ? custom : [groqSttModel(), "whisper-large-v3"])])];
}

/** Tries every (key, model) pair that is not paused; a 429/402/5xx pauses that pair and moves on. */
async function groqTranscribe(audio: Uint8Array, mimeType: string): Promise<string> {
  const keys = keyPool("GROQ");
  let lastError: unknown = new Error("Lingora English is busy right now. Please wait a moment and try again.");
  for (let k = 0; k < keys.length; k += 1) {
    for (const model of groqSttModelChain()) {
      const keyId = `groq#${k}`;
      const modelId = `groq#${k}:${model}`;
      if (isPaused(keyId) || isPaused(modelId)) continue;
      try {
        const text = await groqTranscribeOnce(audio, mimeType, model, keys[k]!);
        lastServed.stt = model;
        return text;
      } catch (err) {
        lastError = err;
        const status = err instanceof GroqHttpError ? err.status : 0;
        const failure = status ? classifyFailure(status, err instanceof GroqHttpError ? err.body : "") : null;
        if (!failure) throw err; // not something another key/model can fix
        pause(failure.scope === "key" ? keyId : modelId, failure.ms, `${model}: ${failure.why}`);
      }
    }
  }
  throw lastError;
}

class GroqHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Groq API error (${status}): ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

async function groqTranscribeOnce(audio: Uint8Array, mimeType: string, model: string, key: string): Promise<string> {
  const base = (mimeType.split(";")[0] ?? "audio/wav").trim();
  const bytes = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  const language = (process.env["GROQ_STT_LANGUAGE"] ?? "en").trim();

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: base }), `audio.${audioFileExtension(base)}`);
      form.append("model", model);
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      if (language) form.append("language", language);

      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Rate limit / credits / provider error: leave it to groqTranscribe() to rotate, no local retry.
        throw new GroqHttpError(res.status, body);
      }

      const data = (await res.json()) as GroqWhisperResponse;
      // Drop segments Whisper itself flags as probably-not-speech.
      const kept = (data.segments ?? []).filter(
        (s) => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1),
      );
      const text = (data.segments ? kept.map((s) => s.text ?? "").join(" ") : (data.text ?? "")).replace(/\s+/g, " ").trim();
      const normalised = text.toLowerCase().replace(/[^a-z' ]/g, "").trim();
      if (!/\p{L}/u.test(text)) return ""; // punctuation-only (".") is what Whisper returns for plain noise
      if (WHISPER_PHANTOM_PHRASES.has(normalised)) return "";
      // On a long silent clip Whisper answers "Thank you." with full confidence. A real
      // "Thank you" is short, so only treat it as phantom when the clip is long.
      if (WHISPER_LONG_CLIP_PHANTOMS.has(normalised) && (data.duration ?? 0) >= 2.5) return "";
      return text;
    } catch (err) {
      lastError = err;
      if (err instanceof GroqHttpError) throw err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 600)); // network blip: one quick retry
    }
  }
  throw lastError ?? new Error("Groq STT returned no transcript.");
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
 *
 * `reducedFrom` (Pronunciation → Reductions only): `target` is then an
 * informally-spelled casual form ("I dunno.", "Jeetyet?") and `reducedFrom`
 * the full sentence it comes from ("I don't know.", "Did you eat yet?").
 * The prompt says so explicitly — without the full form, eye-dialect
 * spellings are ambiguous to a listener, and a learner carefully saying the
 * full sentence would otherwise score as a perfect match for the wrong goal.
 */
export async function analysePronunciationAudio(
  audio: Uint8Array,
  mimeType: string,
  target: string,
  langNote: string,
  reducedFrom?: string,
): Promise<AudioPronunciationFeedback | null> {
  if (!geminiKey()) return null;
  const base = mimeType.split(";")[0] ?? "audio/wav";
  const task = reducedFrom
    ? `Listen to this recording of a learner practising the casual, reduced spoken form "${target}" — the way native speakers actually say "${reducedFrom}" in relaxed, fast speech. The spelling is informal on purpose: judge it as that reduced pronunciation, not as the careful full sentence.
${langNote}
Give honest, specific feedback on how natural the REDUCED pronunciation sounds — linking, weakened or dropped sounds, rhythm, anything a real listener would notice. If the learner instead carefully pronounces every word of the full form, that is understandable English but not what this exercise practises: say so, and score it clearly lower. Also give your own honest overall score from 0 to 100 (how close it sounded to a natural reduced pronunciation of the target) — this is your expert judgement as a listener, not a lab measurement, but still give a specific number rather than refusing to score it. If the recording is silent, too quiet, or unintelligible, say so plainly and score it low instead of guessing generously.`
    : `Listen to this recording of a learner trying to say: "${target}"
${langNote}
Give honest, specific pronunciation feedback based on what you actually hear in the audio — sounds that were unclear or mispronounced, whether stress and intonation sounded natural, anything a real listener would notice. Also give your own honest overall pronunciation score from 0 to 100 (how close it sounded to a natural, accurate pronunciation of the target) — this is your expert judgement as a listener, not a lab measurement, but still give a specific number rather than refusing to score it. If the recording is silent, too quiet, or unintelligible, say so plainly and score it low instead of guessing generously.`;
  const res = await geminiFetch(geminiLlmModel(), {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: base, data: base64FromBytes(audio) } },
          {
            text: `${task}
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
/** Providers are tried in AI_TTS_ORDER (default "gemini,groq": Gemini's cheapest TTS model first, which also
 * keeps the voice identical to the audio already cached; Groq Orpheus is the fallback). */
export async function synthesise(text: string, voice: string): Promise<{ base64: string; mime: string }> {
  let lastError: unknown;
  let tried = false;
  for (const provider of providerOrder("AI_TTS_ORDER", ["gemini", "groq"] as const)) {
    try {
      if (provider === "gemini" && keyPool("GEMINI").length) {
        tried = true;
        return await geminiSynthesise(text, voice);
      }
      if (provider === "groq" && keyPool("GROQ").length) {
        tried = true;
        return await groqSynthesise(text, voice);
      }
    } catch (err) {
      lastError = err;
      console.warn(`[ai] TTS via ${provider} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!tried) throw new AiNotConnectedError("tts", "GEMINI_API_KEY or GROQ_API_KEY");
  throw lastError;
}

/* --------------------------- Groq TTS (Orpheus) --------------------------- */

const GROQ_BASE = "https://api.groq.com/openai/v1";
/** Groq's Orpheus English model accepts short inputs only (documented limit: 200 characters). */
const GROQ_TTS_MAX_CHARS = 190;

function groqTtsModel(): string {
  return process.env["GROQ_TTS_MODEL"] ?? "canopylabs/orpheus-v1-english";
}

/** Our public voice names mapped to Groq Orpheus voices (names documented by Groq: hannah, austin, troy). */
const GROQ_VOICE_MAP: Record<string, string> = {
  shimmer: "hannah",
  nova: "hannah",
  alloy: "austin",
  coral: "hannah",
  sage: "troy",
};

function splitForGroq(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > GROQ_TTS_MAX_CHARS) {
      push();
      let rest = s.trim();
      while (rest.length > GROQ_TTS_MAX_CHARS) {
        let cut = rest.lastIndexOf(" ", GROQ_TTS_MAX_CHARS);
        if (cut < 40) cut = GROQ_TTS_MAX_CHARS;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      cur = rest;
    } else if ((cur + s).length > GROQ_TTS_MAX_CHARS) {
      push();
      cur = s;
    } else {
      cur += s;
    }
  }
  push();
  return chunks;
}

/** One Orpheus request (<= 200 chars), rotating over the configured Groq keys: a key that is rate-limited
 * (429, e.g. the 100-requests/day free quota) or out of credits is paused and the next key is used. */
async function groqSynthesiseChunk(input: string, voice: string): Promise<string> {
  const keys = keyPool("GROQ");
  const model = groqTtsModel();
  let lastError: unknown = new Error("Groq TTS is busy right now.");
  for (let k = 0; k < keys.length; k += 1) {
    const keyId = `groq#${k}`;
    const modelId = `groq#${k}:${model}`;
    if (isPaused(keyId) || isPaused(modelId)) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${GROQ_BASE}/audio/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys[k]}` },
          body: JSON.stringify({ model, input, voice, response_format: "wav" }),
        });
        if (!res.ok) throw new GroqHttpError(res.status, await res.text().catch(() => ""));
        lastServed.tts = model;
        return normaliseGroqWav(new Uint8Array(await res.arrayBuffer()));
      } catch (err) {
        lastError = err;
        if (err instanceof GroqHttpError) {
          const failure = classifyFailure(err.status, err.body);
          if (failure) {
            pause(failure.scope === "key" ? keyId : modelId, failure.ms, `${model}: ${failure.why}`);
            break; // next key
          }
          throw err; // 400 etc.: another key will not help
        }
        if (attempt < 1) await new Promise((r) => setTimeout(r, 600)); // network blip: one quick retry
      }
    }
  }
  throw lastError;
}

/**
 * Orpheus leaves a short burst of high-frequency noise ("xì") about 80-160ms after the last word of a
 * sentence (measured 2026-10-02: ~60ms, ~8% of the speech peak, only after the speech has ended; it is not
 * caused by "!" or "?"). Cut everything after the last clearly-voiced frame (+50ms so soft final
 * consonants survive), fade out over 30ms, then append 200ms of digital silence so back-to-back sentences
 * keep a natural pause. 16-bit mono PCM in, same format out.
 */
function trimOrpheusTail(pcm: Uint8Array): Uint8Array {
  const samples = Math.floor(pcm.length / 2);
  const frame = Math.round(PCM_SAMPLE_RATE * 0.01); // 10ms
  if (samples < frame * 10) return pcm;
  const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);

  const rms: number[] = [];
  for (let start = 0; start + frame <= samples; start += frame) {
    let sum = 0;
    for (let i = 0; i < frame; i += 1) {
      const v = view.getInt16((start + i) * 2, true) / 32768;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / frame));
  }
  const peak = Math.max(...rms);
  if (peak < 0.02) return pcm; // essentially silent: nothing to anchor on
  // Speech = a run of at least 3 frames (30ms) above 10% of the peak. The noise burst is shorter than that,
  // so it is not mistaken for the end of the last word (some takes push it just over the 10% line).
  const loud = rms.map((v) => v >= peak * 0.1);
  let last = 0;
  for (let i = loud.length - 1; i >= 2; i -= 1) {
    if (loud[i] && loud[i - 1] && loud[i - 2]) {
      last = i;
      break;
    }
  }
  if (last === 0) return pcm; // no sustained speech found: leave the clip untouched

  const keep = Math.min(samples, (last + 1) * frame + Math.round(PCM_SAMPLE_RATE * 0.05));
  const fade = Math.min(keep, Math.round(PCM_SAMPLE_RATE * 0.03));
  const silence = Math.round(PCM_SAMPLE_RATE * 0.2);
  const out = new Uint8Array((keep + silence) * 2);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < keep; i += 1) {
    let v = view.getInt16(i * 2, true);
    const intoFade = i - (keep - fade);
    if (intoFade > 0) v = Math.round(v * (1 - intoFade / fade));
    outView.setInt16(i * 2, v, true);
  }
  return out;
}

/**
 * Groq's WAV is a streaming-style file: RIFF/data sizes are 0xFFFFFFFF and there is an
 * extra LIST chunk, so its header is not the fixed 44 bytes the rest of this file
 * (concatWavClips) assumes. Pull the raw PCM out by walking the chunks and re-wrap it
 * exactly like Gemini's output (24kHz mono 16-bit, clean header, fade in/out).
 */
function normaliseGroqWav(wav: Uint8Array): string {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number) => String.fromCharCode(wav[o]!, wav[o + 1]!, wav[o + 2]!, wav[o + 3]!);
  if (wav.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Groq TTS returned an unreadable audio file.");

  let sampleRate = 24000;
  let channels = 1;
  let bits = 16;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      const end = size === 0xffffffff || body + size > wav.length ? wav.length : body + size;
      const pcm = wav.slice(body, end);
      if (sampleRate !== PCM_SAMPLE_RATE || channels !== PCM_CHANNELS || bits !== PCM_BITS_PER_SAMPLE) {
        throw new Error(`Groq TTS returned an unexpected audio format (${sampleRate}Hz/${channels}ch/${bits}bit).`);
      }
      return wrapPcmAsWav(base64FromBytes(trimOrpheusTail(pcm)), sampleRate, channels, bits);
    }
    offset = body + size + (size % 2);
  }
  throw new Error("Groq TTS returned no audio data.");
}

async function groqSynthesise(text: string, voice: string): Promise<{ base64: string; mime: string }> {
  const groqVoice = GROQ_VOICE_MAP[voice] ?? "hannah";
  const clean = cleanTextForTts(text) || text.trim() || "...";
  const clips: string[] = [];
  for (const chunk of splitForGroq(clean)) clips.push(await groqSynthesiseChunk(chunk, groqVoice));
  if (clips.length === 0) throw new Error("Groq TTS returned no audio.");
  let out = clips[0]!;
  for (const clip of clips.slice(1)) out = concatWavClips(out, clip, 120);
  return { base64: out, mime: "audio/wav" };
}
