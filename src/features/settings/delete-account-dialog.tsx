"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAppActions, useOnline, useUserId } from "@/components/app-state";
import { Dialog } from "@/components/dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { mutation } from "@/lib/browser/api";

/** The literal the server compares before it erases an account. */
const confirmationWord = "DELETE";

/** Erases the signed-in account after the listener types the confirmation word. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const actions = useAppActions();
  const userId = useUserId();
  const online = useOnline();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
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
          if (confirmation !== confirmationWord) return;
          setBusy(true);
          try {
            await mutation("/api/me", { confirmation }, "DELETE", userId ?? undefined);
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
        <Button danger disabled={confirmation !== confirmationWord || busy || !online}>
          {t("settings.confirmDelete")}
        </Button>
      </form>
    </Dialog>
  );
}
