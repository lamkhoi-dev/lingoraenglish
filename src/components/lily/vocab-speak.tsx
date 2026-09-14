import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { MicRecorder } from "./mic-recorder";
import { PanelCard } from "./score-panel";
import { SpeakingFeedback } from "./speaking-feedback";
import { usePaywall } from "@/hooks/use-paywall";
import type { Recording } from "@/hooks/use-recorder";
import { useAuth } from "@/lib/auth";
import { saveSpeakingAttempt } from "@/lib/attempts.functions";
import { useI18n } from "@/lib/i18n";
import { analyseSpeaking, transcribeAudio, type SpeakingAnalysis } from "@/lib/lily.functions";

/**
 * "USE IT": the learner speaks a sentence with the target word and the coach
 * checks whether the word was actually used correctly.
 */
export function VocabSpeakPractice({ word, prompt }: { word: string; prompt: string }) {
  const { locale, englishOnly } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user, profile } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analyseSpeaking);
  const saveAttempt = useServerFn(saveSpeakingAttempt);
  const { paywall, handleError, clearPaywall } = usePaywall("speaking");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ analysis: SpeakingAnalysis; transcript: string } | null>(null);

  const question = `${prompt} Use the word "${word}" in your answer.`;

  const submit = async (recording: Recording) => {
    if (!user) return;
    clearPaywall();
    setBusy(true);
    try {
      const { transcript } = await transcribe({
        data: { audioBase64: recording.base64, mimeType: recording.mimeType },
      });
      if (!transcript.trim()) {
        toast.error("I couldn't hear that. Please record again.");
        return;
      }
      const analysis = await analyse({
        data: { question, transcript, lang, level: profile?.english_level ?? "B1" },
      });
      setResult({ analysis, transcript });
      await saveAttempt({
        data: {
          questionText: question.slice(0, 500),
          transcript,
          fluency: analysis.fluency,
          grammar: analysis.grammar,
          vocabulary: analysis.vocabulary,
          overall: analysis.overall,
          mistakes: analysis.mistakes,
          corrections: analysis.corrections,
          betterVocabulary: analysis.better_vocabulary,
          naturalAnswer: analysis.natural_answer,
          feedback: analysis.feedback,
        },
      });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelCard title={`Use it in speaking — ${word}`} demo={!user}>
      {paywall}
      <p className="font-display text-xl text-foreground">{question}</p>
      <div className="mt-6">
        <MicRecorder
          onSubmit={submit}
          busy={busy}
          busyLabel="Checking your sentence"
          disabled={!user}
          hint="Say a full sentence that uses the word naturally."
          disabledReason={
            <Link to="/auth" className="text-brass-soft hover:text-brass">
              Sign in to record
            </Link>
          }
        />
      </div>
      {result && (
        <div className="mt-8 border-t border-border pt-6">
          <SpeakingFeedback
            analysis={result.analysis}
            transcript={result.transcript}
            onRetry={() => setResult(null)}
          />
        </div>
      )}
    </PanelCard>
  );
}
