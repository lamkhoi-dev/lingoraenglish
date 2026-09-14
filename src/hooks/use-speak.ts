import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { speak as speakFn } from "@/lib/lily.functions";
import { useAuth } from "@/lib/auth";
import { voicePlayer, type VoiceStatus } from "@/lib/voice-player";

/**
 * Site-wide voice hook. All playback runs through the global voice player, so
 * the complete response is always spoken, long text is chunked at sentence
 * boundaries, and re-renders or navigation never cut a sentence in half.
 */
export function useSpeak(voice = "shimmer") {
  const requestSpeech = useServerFn(speakFn);
  const { user } = useAuth();
  const [status, setStatus] = useState<VoiceStatus>(voicePlayer.getState().status);
  const [current, setCurrent] = useState<string | null>(voicePlayer.getState().text);

  useEffect(
    () =>
      voicePlayer.subscribe((state) => {
        setStatus(state.status);
        setCurrent(state.text);
      }),
    [],
  );

  const play = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (!user) {
        toast.error("Sign in to hear Lingora English's voice.");
        return;
      }
      try {
        await voicePlayer.play(
          text,
          async (chunk) => {
            const res = await requestSpeech({ data: { text: chunk, voice } });
            return { audioBase64: res.audioBase64, mime: res.mime };
          },
          voice,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not play audio.");
        throw error;
      }
    },
    [requestSpeech, user, voice],
  );

  const stop = useCallback(() => voicePlayer.stop(), []);
  const pause = useCallback(() => voicePlayer.pause(), []);
  const resume = useCallback(() => voicePlayer.resume(), []);

  return {
    play,
    stop,
    pause,
    resume,
    status,
    /** Text currently being spoken (used for "Listening…" button highlighting). */
    speaking: status === "playing" || status === "loading" ? current : null,
    isSpeaking: status === "playing" || status === "loading",
    loading: status === "loading",
    paused: status === "paused",
  };
}
