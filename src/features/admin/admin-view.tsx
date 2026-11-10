"use client";
import { useTranslations } from "next-intl";
import { useIsAdmin } from "@/components/app-state";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { onDemand, useOnDemand } from "@/lib/on-demand";
import { AccountGate } from "@/features/account/account-gate";

// The content studio (editor, release review, collections and the Zod schemas that check a
// recording) downloads only once the signed-in account is known to be an administrator, so
// guests and listeners never fetch it.
const consoleCode = onDemand(() => import("./admin-console").then((module) => module.default));

function AdminConsole() {
  const t = useTranslations();
  const code = useOnDemand(consoleCode, true);
  if (code.state === "loaded") {
    const Console = code.value;
    return <Console />;
  }
  if (code.state === "failed")
    return (
      <ErrorState
        message={t("errors.unavailable")}
        action={
          <Button variant="secondary" onClick={() => void consoleCode.load().catch(() => {})}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  return <p role="status">{t("common.loading")}</p>;
}

export function AdminView() {
  const t = useTranslations();
  const isAdmin = useIsAdmin();
  return (
    <>
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")} />
      <AccountGate context="admin">
        {isAdmin ? <AdminConsole /> : <p className="info-panel">{t("admin.restrictedText")}</p>}
      </AccountGate>
    </>
  );
}
