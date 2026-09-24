/**
 * GLOBAL VOICE PLAYER
 * ------------------------------------------------------------------
 * One single audio owner for the whole site. Every voice feature
 * (coach, shadowing, daily English, pronunciation, tests, vocabulary)
 * plays through this module, so a response can never be cut off by a
 * React re-render, a state update, a microphone UI change or a second
 * component mounting.
 *
 * Guarantees:
 *  - the complete text is spoken: long text is split at SENTENCE
 *    boundaries only and the chunks are played back-to-back;
 *  - audio stops only on an explicit stop()/new play() request;
 *  - playback state is observable (subscribe) for button states.
 */

export type VoiceStatus = "idle" | "loading" | "playing" | "paused";

export type VoiceState = {
  status: VoiceStatus;
  /** The full canonical text currently being spoken (never a fragment). */
  text: string | null;
};

export type AudioChunk = { audioBase64: string; mime: string };
export type ChunkFetcher = (text: string) => Promise<AudioChunk>;

/** Max characters per text-to-speech request. Chunks are cut at sentences only.
 * Reduced to ~120 characters so the first sentence plays in 2s instead of 9s,
 * while subsequent sentences prefetch seamlessly in the background. */
const MAX_CHUNK = 120;

/** Split text into speakable chunks, never mid-word and never mid-sentence. */
export function splitForSpeech(text: string, maxChars = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.trim().length > maxChars) {
      flush();
      // A single very long sentence: break at clause commas, never mid-word.
      const parts = sentence.split(/(?<=,)\s+/);
      let buf = "";
      for (const part of parts) {
        if (buf && (buf + part).length > maxChars) {
          chunks.push(buf.trim());
          buf = "";
        }
        buf += `${part} `;
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }
    if (current && (current + sentence).length > maxChars) flush();
    current += sentence;
  }
  flush();
  return chunks;
}

type Listener = (state: VoiceState) => void;

/** Short 150ms buffer before audio playback begins when instant from cache. */
const PLAY_DELAY_MS = 150;

class VoicePlayer {
  private state: VoiceState = { status: "idle", text: null };
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  /** Every play() gets a token; stale runs abort themselves. */
  private token = 0;
  private cache = new Map<string, AudioChunk>();
  /** Resolves the in-flight playback promise when a run is superseded. */
  private cancelCurrent: (() => void) | null = null;
  private primed = false;

  /**
   * Pre-unlocks audio playback in modern browsers (Chrome, Safari, iOS, Edge)
   * by playing a silent sample synchronously during a user click/touch gesture.
   * This prevents browser Autoplay Policy from blocking delayed async TTS.
   */
  prime() {
    if (this.primed || typeof window === "undefined") return;
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
      audio.volume = 0.001;
      const p = audio.play();
      if (p) {
        p.then(() => {
          this.primed = true;
          audio.pause();
        }).catch(() => {});
      }
    } catch {
      // Ignore errors in priming
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): VoiceState {
    return this.state;
  }

  private set(next: Partial<VoiceState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l(this.state);
  }

  /** Speaks the complete text. Resolves when the last chunk has finished. */
  async play(text: string, fetchChunk: ChunkFetcher, voiceKey = "default"): Promise<void> {
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;

    this.prime();
    this.hardStop();
    const run = ++this.token;
    this.set({ status: "loading", text });

    try {
      for (let i = 0; i < chunks.length; i += 1) {
        if (run !== this.token) return; // superseded or stopped
        const chunk = chunks[i]!;
        const key = `${voiceKey}::${chunk}`;
        let audio = this.cache.get(key);
        const wasCached = Boolean(audio);

        if (!audio) {
          // Automatic 1-retry with backoff to absorb transient 503 / network spikes
          let lastErr: unknown;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              audio = await fetchChunk(chunk);
              this.cache.set(key, audio);
              break;
            } catch (err) {
              lastErr = err;
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 600));
              }
            }
          }
          if (!audio) throw lastErr;
        }
        if (run !== this.token) return;

        // If audio was already cached, small 150ms buffer so it doesn't blare abruptly;
        // if freshly fetched over network, learner has already waited so play immediately.
        if (i === 0 && wasCached) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, PLAY_DELAY_MS);
            this.cancelCurrent = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          if (run !== this.token) return;
        }

        // Pre-fetch the next chunk while this one plays so playback is gapless.
        const nextChunk = chunks[i + 1];
        const prefetch =
          nextChunk && !this.cache.has(`${voiceKey}::${nextChunk}`)
            ? fetchChunk(nextChunk)
                .then((a) => this.cache.set(`${voiceKey}::${nextChunk}`, a))
                .catch(() => undefined)
            : Promise.resolve();

        await this.playOne(`data:${audio.mime};base64,${audio.audioBase64}`, run);
        await prefetch;
      }
      if (run === this.token) this.set({ status: "idle", text: null });
    } catch (error) {
      if (run === this.token) this.set({ status: "idle", text: null });
      throw error;
    }
  }

  /**
   * Plays one already-fetched audio source (used by shadowing / pronunciation,
   * which need playback rate and looping). Still goes through the single global
   * audio owner so two features can never speak over each other.
   */
  async playRaw(src: string, opts: { rate?: number; loop?: boolean; label?: string } = {}): Promise<void> {
    this.prime();
    this.hardStop();
    const run = ++this.token;
    this.set({ status: "loading", text: opts.label ?? null });

    // Smooth transition buffer
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PLAY_DELAY_MS);
      this.cancelCurrent = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    if (run !== this.token) return;

    await new Promise<void>((resolve, reject) => {
      this.cancelCurrent = resolve;
      const el = new Audio(src);
      el.playbackRate = opts.rate ?? 1;
      el.loop = Boolean(opts.loop);
      this.audio = el;
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("Audio playback failed."));
      el.onplay = () => {
        if (run === this.token) this.set({ status: "playing" });
      };
      el.play().catch((err: unknown) => {
        if (err instanceof Error && (err.name === "NotAllowedError" || err.message.toLowerCase().includes("interact"))) {
          console.warn("Autoplay deferred by browser policy; waiting for direct tap.", err);
          if (run === this.token) this.set({ status: "idle" });
          resolve();
          return;
        }
        reject(err);
      });
    });
    if (run === this.token) this.set({ status: "idle", text: null });
  }

  private playOne(src: string, run: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.cancelCurrent = resolve;
      const el = new Audio(src);
      this.audio = el;
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("Audio playback failed."));
      el.onplay = () => {
        if (run === this.token) this.set({ status: "playing" });
      };
      el.play().catch((err: unknown) => {
        // If the browser blocked programmatic autoplay because the user gesture expired,
        // don't treat it as a fatal error — resolve cleanly so the UI stays ready for manual tap.
        if (err instanceof Error && (err.name === "NotAllowedError" || err.message.toLowerCase().includes("interact"))) {
          console.warn("Autoplay deferred by browser policy; waiting for user click.", err);
          if (run === this.token) this.set({ status: "idle" });
          resolve();
          return;
        }
        reject(err);
      });
    });
  }

  private hardStop() {
    // Release any awaiting playback promise so the previous run can unwind.
    this.cancelCurrent?.();
    this.cancelCurrent = null;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
  }

  pause() {
    if (this.state.status !== "playing") return;
    this.audio?.pause();
    this.set({ status: "paused" });
  }

  resume() {
    if (this.state.status !== "paused") return;
    void this.audio?.play().catch(() => undefined);
    this.set({ status: "playing" });
  }

  stop() {
    this.token += 1;
    this.hardStop();
    this.set({ status: "idle", text: null });
  }

  isSpeaking(): boolean {
    return this.state.status === "playing" || this.state.status === "loading";
  }
}

export const voicePlayer = new VoicePlayer();
