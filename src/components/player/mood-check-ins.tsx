"use client";
import { useTranslations } from "next-intl";
import { useStore } from "@/lib/state/create-store";
import type { PlaybackEngine } from "@/lib/playback/engine";
import { useAppActions, usePersonalError } from "../app-state";
import { Dialog } from "../dialog";
import { MoodScores } from "./mood-scores";

/** The optional mood check-ins before and after a listening session. */
export function MoodCheckIns({ engine }: { engine: PlaybackEngine }) {
  const t = useTranslations();
  const { announce, perform } = useAppActions();
  const personalError = usePersonalError();
  const before = useStore(engine.prompts, (prompts) => prompts.before);
  const after = useStore(engine.prompts, (prompts) => prompts.after);
  const score = useStore(engine.prompts, (prompts) => prompts.score);
  return (
    <>
      <Dialog
        open={!!before}
        onOpenChange={engine.dismissBefore}
        title={t("mood.before")}
        description={t("mood.note")}
      >
        <MoodScores value={score} onChange={engine.chooseScore} />
        <div className="dialog-actions">
          <button
            className="button"
            disabled={!score}
            onClick={() => engine.listenAfterCheckIn(true)}
          >
            {t("mood.saveListen")}
          </button>
          <button className="button secondary" onClick={() => engine.listenAfterCheckIn(false)}>
            {t("mood.skipListen")}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={!!after}
        onOpenChange={engine.dismissAfter}
        title={t("mood.after")}
        description={t("mood.note")}
      >
        <MoodScores value={score} onChange={engine.chooseScore} />
        <div className="dialog-actions">
          <button
            className="button"
            disabled={!score}
            onClick={async () => {
              if (
                after &&
                score &&
                (await perform("/api/sessions", { sessionId: after, afterScore: score }, "PATCH"))
              ) {
                engine.dismissAfter();
                announce(t("mood.saved"));
              }
            }}
          >
            {t("mood.saveAfter")}
          </button>
          <button className="button secondary" onClick={engine.dismissAfter}>
            {t("mood.skip")}
          </button>
        </div>
        {personalError && (
          <p role="alert" className="error">
            {personalError}
          </p>
        )}
      </Dialog>
    </>
  );
}
