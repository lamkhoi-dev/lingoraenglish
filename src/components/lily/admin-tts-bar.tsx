import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { adminTtsGenerate, adminTtsGetSaved, adminTtsSave } from "@/lib/tts-admin.functions";
import { ttsAdminStore } from "@/lib/tts-admin-store";
import { cn } from "@/lib/utils";
import { voicePlayer } from "@/lib/voice-player";

type Clip = { text: string; voice: string; audioBase64: string | null; mime: string | null };

/**
 * Admin-only "Tạo bản mới" for every spoken clip on the site. It follows whatever the player last asked the
 * server for (see tts-admin-store.ts) and offers the same three steps as the Sounds tool: hear the saved
 * clip, generate a fresh candidate without saving it, and save the candidate over the saved clip. Nothing
 * renders for anyone who is not an admin, and every server call re-checks the role. Labels are Vietnamese on
 * purpose, not i18n — only admins see this.
 */
export function AdminTtsBar() {
  const { isAdmin } = useAuth();
  const items = useSyncExternalStore(ttsAdminStore.subscribe, ttsAdminStore.get, ttsAdminStore.getServer);
  const getSaved = useServerFn(adminTtsGetSaved);
  const generate = useServerFn(adminTtsGenerate);
  const save = useServerFn(adminTtsSave);

  const [busy, setBusy] = useState<null | "saved" | "new" | "save">(null);
  const [playing, setPlaying] = useState(false);
  const [candidate, setCandidate] = useState<Clip[] | null>(null);
  const [closed, setClosed] = useState(false);

  // A candidate belongs to the clip it was generated for: a new clip starts clean (and re-opens the bar).
  useEffect(() => {
    setCandidate(null);
    setClosed(false);
  }, [items]);

  if (!isAdmin || closed || items.length === 0) return null;

  const playClips = async (clips: Clip[]) => {
    setPlaying(true);
    try {
      voicePlayer.prime();
      for (const clip of clips) {
        if (!clip.audioBase64) continue;
        await voicePlayer.playRaw(`data:${clip.mime ?? "audio/wav"};base64,${clip.audioBase64}`, { label: clip.text });
      }
    } finally {
      setPlaying(false);
    }
  };

  const fail = (error: unknown, fallback: string) =>
    toast.error(error instanceof Error && error.message ? error.message : fallback);

  const hearSaved = async () => {
    setBusy("saved");
    try {
      const { clips } = await getSaved({ data: { items } });
      if (clips.every((c) => !c.audioBase64)) {
        toast.info("Chưa có bản lưu cho câu này — học viên sẽ nghe bản AI tạo lần đầu.");
        return;
      }
      setBusy(null);
      await playClips(clips);
    } catch (error) {
      fail(error, "Không nghe được bản đang lưu.");
    } finally {
      setBusy(null);
    }
  };

  const makeNew = async () => {
    setBusy("new");
    try {
      const { clips } = await generate({ data: { items } });
      setCandidate(clips);
      setBusy(null);
      await playClips(clips);
    } catch (error) {
      fail(error, "Không tạo được bản mới.");
    } finally {
      setBusy(null);
    }
  };

  const saveNew = async () => {
    if (!candidate) return;
    setBusy("save");
    try {
      await save({
        data: {
          items: candidate.map((c) => ({
            text: c.text,
            voice: c.voice,
            audioBase64: c.audioBase64 ?? "",
            mimeType: c.mime ?? "audio/wav",
          })),
        },
      });
      for (const c of candidate) voicePlayer.forget(c.voice, [c.text]);
      toast.success("Đã lưu — học viên sẽ nghe bản này. Trang đang mở có thể cần tải lại để nghe bản mới.");
      setCandidate(null);
    } catch (error) {
      fail(error, "Không lưu được bản mới.");
    } finally {
      setBusy(null);
    }
  };

  const first = items[0]!.text;
  const preview = first.length > 80 ? `${first.slice(0, 80)}…` : first;
  const disabled = busy !== null || playing;
  const pill =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border transition-colors";

  return (
    <div className="fixed bottom-4 left-4 z-[60] w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-brass/60 bg-plum-deep p-3 text-xs text-brass-soft shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">Admin · âm thanh vừa nghe</p>
        <button type="button" onClick={() => setClosed(true)} aria-label="Đóng" className="opacity-70 hover:opacity-100">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 break-words opacity-90">
        “{preview}”{items.length > 1 ? ` (+${items.length - 1} đoạn)` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void hearSaved()}
          disabled={disabled}
          title="Nghe bản đang lưu trong DB (bản học viên đang nghe)."
          className={cn(pill, "bg-surface-3 text-foreground hover:bg-surface-2", disabled && "cursor-not-allowed opacity-70")}
        >
          {busy === "saved" ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
          Bản đang lưu
        </button>
        <button
          type="button"
          onClick={() => void makeNew()}
          disabled={disabled}
          title="Gọi AI tạo bản mới để nghe thử — chưa lưu vào DB."
          className={cn(pill, "bg-plum text-brass-soft hover:bg-plum/80", disabled && "cursor-not-allowed opacity-70")}
        >
          {busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {busy === "new" ? "Đang tạo…" : "Tạo bản mới"}
        </button>
        {candidate && (
          <>
            <button
              type="button"
              onClick={() => void playClips(candidate)}
              disabled={disabled}
              title="Nghe lại bản mới vừa tạo (không tốn thêm lượt gọi AI)."
              className={cn(pill, "bg-surface-3 text-foreground hover:bg-surface-2", disabled && "cursor-not-allowed opacity-70")}
            >
              <Volume2 className="size-3.5" />
              Nghe lại bản mới
            </button>
            <button
              type="button"
              onClick={() => void saveNew()}
              disabled={disabled}
              title="Lưu đúng bản mới này vào DB cho mọi học viên."
              className={cn(pill, "bg-brass text-plum-deep hover:bg-brass/90", disabled && "cursor-not-allowed opacity-70")}
            >
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Lưu bản này
            </button>
          </>
        )}
      </div>
    </div>
  );
}
