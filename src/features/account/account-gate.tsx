"use client";
import { useTranslations } from "next-intl";
import {
  useAppActions,
  useAuthLoading,
  usePersonalError,
  usePersonalPending,
  useUserId,
} from "@/components/app-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { primaryControl } from "@/lib/perf/readiness";

/**
 * Shows its children to a signed-in account once its personal data has arrived, and a sign-in
 * invitation to a guest. Until both are known it shows a loading status, so a screen never
 * offers what the account already has (mood consent, an empty library) in the meantime.
 */
export function AccountGate({
  children,
  context,
}: {
  children: React.ReactNode;
  context?: "mood" | "admin";
}) {
  const t = useTranslations();
  const { openAuth } = useAppActions();
  const authLoading = useAuthLoading();
  const signedIn = useUserId() !== null;
  const pending = usePersonalPending();
  const error = usePersonalError();
  if (authLoading || pending) return <p role="status">{t("common.loading")}</p>;
  if (!signedIn)
    return (
      <EmptyState
        title={t(
          context === "mood"
            ? "auth.requiredMood"
            : context === "admin"
              ? "auth.requiredAdmin"
              : "auth.required",
        )}
        text={t(
          context === "mood"
            ? "auth.requiredMoodText"
            : context === "admin"
              ? "auth.requiredAdminText"
              : "auth.requiredText",
        )}
      >
        <Button onClick={openAuth} {...primaryControl()}>
          {t("nav.signIn")}
        </Button>
      </EmptyState>
    );
  return (
    <>
      {children}
      {error && <InlineAlert>{error}</InlineAlert>}
    </>
  );
}
