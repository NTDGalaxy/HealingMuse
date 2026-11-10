"use client";
import { useTranslations } from "next-intl";
import { useAppActions, useAuthOpen } from "@/components/app-state";
import { onDemand, useOnDemand } from "@/lib/on-demand";

/** The sign-in dialog's code, without the Supabase client, which loads separately. */
export const authDialogCode = onDemand(() =>
  import("./auth-dialog").then((module) => module.AuthDialog),
);

/** Renders the sign-in dialog once it is opened (or preloaded); a failed download keeps it shut. */
export function AuthDialogOnDemand() {
  const t = useTranslations("errors");
  const open = useAuthOpen();
  const { closeAuth, announce } = useAppActions();
  const code = useOnDemand(authDialogCode, open, () => {
    closeAuth();
    announce(t("unavailable"));
  });
  if (code.state !== "loaded") return null;
  const AuthDialog = code.value;
  return <AuthDialog />;
}
