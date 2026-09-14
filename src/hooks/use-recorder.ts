import { useCallback, useEffect, useRef, useState } from "react";

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

export type Recording = { blob: Blob; url: string; base64: string; mimeType: string; seconds: number };

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const ratio = sampleRate / targetRate;
  const outLength = Math.floor(merged.length / ratio);
  const samples = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const s = merged[Math.floor(i * ratio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, s));
    samples[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);

  return new Blob([buffer], { type: "audio/wav" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Microphone recorder that always produces a complete 16 kHz mono WAV file,
 * which every browser (including iOS Safari) and the transcription API accept.
 */
export type RecorderOptions = {
  /**
   * Auto-stop after this much continuous silence once the user has actually
   * started speaking. Generous by design so a natural thinking pause
   * ("I usually... um... go shopping") never cuts the learner off.
   */
  silenceStopMs?: number;
  /** Called with the finished recording when silence auto-stop triggers. */
  onSilenceStop?: (recording: Recording) => void;
  /** Hard safety cap on recording length. */
  maxSeconds?: number;
};

export function useRecorder(options: RecorderOptions = {}) {
  const { silenceStopMs = 2600, onSilenceStop, maxSeconds = 180 } = options;
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const speechSeenRef = useRef(false);
  const lastLoudRef = useRef(0);
  const autoStopRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef({ silenceStopMs, onSilenceStop, maxSeconds });
  optionsRef.current = { silenceStopMs, onSilenceStop, maxSeconds };
  /** The object URL of whichever Recording is currently held, if any. */
  const recordingUrlRef = useRef<string | null>(null);

  // Object URLs are never freed by garbage collection on their own — without
  // this, every finished recording's WAV data stays resident in memory for
  // the rest of the page's life, and on a long conversation the buildup can
  // stall the main thread (where audio capture also runs) enough to drop
  // audio frames mid-recording.
  const releaseRecordingUrl = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    cleanup();
    releaseRecordingUrl();
  }, [cleanup, releaseRecordingUrl]);

  const start = useCallback(async () => {
    setError(null);
    releaseRecordingUrl();
    setRecording(null);
    setSeconds(0);
    chunksRef.current = [];
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(analyser);
      source.connect(processor);
      processor.connect(ctx.destination);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      speechSeenRef.current = false;
      lastLoudRef.current = Date.now();
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setLevel(Math.min(1, avg / 90));

        const now = Date.now();
        if (avg > 12) {
          speechSeenRef.current = true;
          lastLoudRef.current = now;
        }
        const { silenceStopMs: quiet, onSilenceStop: cb } = optionsRef.current;
        if (cb && quiet > 0 && speechSeenRef.current && now - lastLoudRef.current > quiet) {
          autoStopRef.current?.();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      timerRef.current = setInterval(
        () =>
          setSeconds((s) => {
            const next = s + 1;
            if (next >= optionsRef.current.maxSeconds) autoStopRef.current?.();
            return next;
          }),
        1000,
      );
      setState("recording");
    } catch {
      setState("error");
      setError("Microphone access is needed to record. Please allow it and try again.");
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<Recording | null> => {
    if (state !== "recording") return null;
    const rate = ctxRef.current?.sampleRate ?? 48000;
    const chunks = chunksRef.current;
    const elapsed = seconds;
    cleanup();

    const blob = encodeWav(chunks, rate);
    if (blob.size < 4096) {
      setState("error");
      setError("That recording was empty — please speak a little longer and try again.");
      return null;
    }
    releaseRecordingUrl();
    const url = URL.createObjectURL(blob);
    recordingUrlRef.current = url;
    const result: Recording = {
      blob,
      url,
      base64: await blobToBase64(blob),
      mimeType: "audio/wav",
      seconds: elapsed,
    };
    setRecording(result);
    setState("stopped");
    return result;
  }, [cleanup, seconds, state]);

  // Auto-stop (silence / max length) reuses exactly the same stop path,
  // so the recording is always a complete WAV file.
  useEffect(() => {
    autoStopRef.current = () => {
      void stop().then((rec) => {
        if (rec) optionsRef.current.onSilenceStop?.(rec);
      });
    };
  }, [stop]);

  const reset = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    releaseRecordingUrl();
    setRecording(null);
    setSeconds(0);
    setError(null);
    setState("idle");
  }, [cleanup, releaseRecordingUrl]);

  return { state, seconds, level, error, recording, start, stop, reset, isRecording: state === "recording" };
}
