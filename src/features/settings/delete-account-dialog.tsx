"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAppActions, useOnline, useUserId } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { mutation } from "@/lib/browser/api";

/** The literal the server compares before it erases an account, in every language. */
const serverConfirmation = "DELETE";

/**
 * Typed text compared without regard to case, outer spaces or accents, so XÓA typed on any
 * keyboard (or as XOA where Vietnamese input is unavailable) confirms.
 */
const normalize = (text: string, locale: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D")
    .trim()
    .toLocaleUpperCase(locale);

/**
 * Erases the signed-in account after the listener types the confirmation word of their language
 * (XÓA in Vietnamese, DELETE in English); the request always carries the server's literal.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const actions = useAppActions();
  const userId = useUserId();
  const online = useOnline();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed =
    normalize(confirmation, locale) === normalize(t("settings.confirmationWord"), locale);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.deleteTitle")}
      description={t("settings.deleteText")}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirmed) return;
          setBusy(true);
          try {
            await mutation(
              "/api/me",
              { confirmation: serverConfirmation },
              "DELETE",
              userId ?? undefined,
            );
            await actions.signOut();
            onOpenChange(false);
            actions.announce(t("settings.deleted"));
          } catch {
            actions.announce(t("errors.unavailable"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          id="delete-confirm"
          label={t("settings.confirmation")}
          value={confirmation}
          autoComplete="off"
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <Button danger disabled={!confirmed || busy || !online}>
          {t("settings.confirmDelete")}
        </Button>
      </form>
    </Dialog>
  );
}
