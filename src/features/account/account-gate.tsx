"use client";
import { useTranslations } from "next-intl";
import { useAppActions, useAuthLoading, usePersonalError, useUserId } from "@/components/app-state";
import { Empty } from "@/components/catalog";
import { primaryControl } from "@/lib/perf/readiness";

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
  const error = usePersonalError();
  if (authLoading) return <p role="status">{t("common.loading")}</p>;
  if (!signedIn)
    return (
      <Empty
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
        <button className="button" onClick={openAuth} {...primaryControl()}>
          {t("nav.signIn")}
        </button>
      </Empty>
    );
  return (
    <>
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
