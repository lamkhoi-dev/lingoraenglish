import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { TranscriptGuidance } from "@/components/lily/listening-guide";
import { useI18n } from "@/lib/i18n";
import type { ConnectedSpeechNote, ScriptLine } from "@/lib/listening-content";

/**
 * The transcript is hidden by default so the learner listens first. Once shown,
 * the audio controls stay on screen so they can replay while reading.
 */
export function ListeningTranscript({
  script,
  connectedSpeech,
}: {
  script: ScriptLine[];
  connectedSpeech: ConnectedSpeechNote[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3.5 py-2 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
      >
        {open ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        {open ? t("listen.transcript.hide") : t("listen.transcript.show")}
      </button>

      <TranscriptGuidance open={open} />

      {open && (
        <div className="mt-3 rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">

          <div className="space-y-3">
            {script.map((line, i) => (
              <p key={i} className="text-sm text-mist">
                <span className="mr-2 font-semibold text-foreground">{line.speaker}:</span>
                “{line.line}”
              </p>
            ))}
          </div>

          {connectedSpeech.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">
                {t("listen.transcript.whySoundsDifferent")}
              </h4>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {connectedSpeech.map((note, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="text-foreground">{note.written}</span> {t("listen.transcript.oftenSoundsLike")}{" "}
                    <span className="text-brass-soft">“{note.spoken}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
