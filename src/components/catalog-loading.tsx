import { useTranslations } from "next-intl";
export function CatalogLoading() {
  const t = useTranslations();
  return (
    <div className="catalog-loading" role="status" aria-busy="true">
      <p>{t("common.loading")}</p>
      <div className="loading-covers" aria-hidden="true">
        {[0, 1, 2, 3].map((id) => (
          <span key={id} />
        ))}
      </div>
    </div>
  );
}
