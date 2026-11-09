"use client";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useIsAdmin } from "@/components/app-state";
import { PageHeader } from "@/components/ui/page-header";
import { AccountGate } from "@/features/account/account-gate";

function ConsoleLoading() {
  const t = useTranslations();
  return <p role="status">{t("common.loading")}</p>;
}

// The content studio (editor, release review, collections and the Zod schemas that check a
// recording) downloads only once the signed-in account is known to be an administrator, so
// guests and listeners never fetch it.
const AdminConsole = dynamic(() => import("./admin-console"), {
  ssr: false,
  loading: ConsoleLoading,
});

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
