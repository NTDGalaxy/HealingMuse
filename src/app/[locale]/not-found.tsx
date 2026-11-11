import Link from "next/link";
import { ListMusic } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

/** A missing page, inside the shell and in the visitor's language, with the way back to music. */
export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")]);
  return (
    <div className="empty-state not-found" data-part="empty-state">
      <ListMusic size={36} aria-hidden="true" />
      <h1 data-part="page-heading">{t("notFound")}</h1>
      <p>{t("notFoundText")}</p>
      <Link className="button" href={`/${locale}`}>
        {t("goHome")}
      </Link>
    </div>
  );
}
