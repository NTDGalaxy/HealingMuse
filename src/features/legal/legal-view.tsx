"use client";
import { useTranslations } from "next-intl";

export function PrivacyView({ terms = false }: { terms?: boolean }) {
  const t = useTranslations("privacy");
  return (
    <article className="legal-page">
      <h1>{t(terms ? "termsTitle" : "title")}</h1>
      {(terms
        ? ["termsIntro", "choice", "rights", "external", "age", "support"]
        : ["intro", "accounts", "mood", "offline", "providers", "logs", "delete", "support"]
      ).map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </article>
  );
}
