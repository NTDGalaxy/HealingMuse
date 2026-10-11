"use client";
import { useTranslations } from "next-intl";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations();
  return (
    <div className="empty-state" role="alert">
      <h1>{t("common.errorTitle")}</h1>
      <p>{t("errors.unavailable")}</p>
      <button className="button" onClick={reset}>
        {t("common.retry")}
      </button>
    </div>
  );
}
