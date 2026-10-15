"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { taxonomy } from "@/lib/catalog-taxonomy";
import type { CatalogQuery } from "@/lib/types";

export function CatalogControls({
  query,
  navigate,
  id = "catalog",
}: {
  query: CatalogQuery;
  navigate: (patch: Partial<CatalogQuery>) => void;
  id?: string;
}) {
  const t = useTranslations();
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(query.goal || query.genre || query.instrument || query.tradition),
  );
  const filtered = Boolean(
    query.q ||
    query.category ||
    query.goal ||
    query.genre ||
    query.instrument ||
    query.tradition ||
    query.collection,
  );
  return (
    <>
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: String(new FormData(event.currentTarget).get("q") || "").trim() });
        }}
      >
        <Search size={21} aria-hidden="true" />
        <label htmlFor={`${id}-search`} className="sr-only">
          {t("catalog.search")}
        </label>
        <input
          key={query.q}
          id={`${id}-search`}
          name="q"
          type="search"
          defaultValue={query.q || ""}
          maxLength={120}
          placeholder={t("catalog.searchPlaceholder")}
        />
        <button className="button">{t("catalog.search")}</button>
      </form>
      <div className="filter-row" role="group" aria-label={t("catalog.title")}>
        {["", "instrumental", "nature"].map((value) => (
          <button
            type="button"
            className="filter-chip"
            key={value}
            aria-pressed={(query.category || "") === value}
            onClick={() => navigate({ category: value })}
          >
            {t(value ? `catalog.${value}` : "common.all")}
          </button>
        ))}
        {filtered && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              navigate({
                q: "",
                category: "",
                goal: "",
                genre: "",
                instrument: "",
                tradition: "",
                collection: "",
              })
            }
          >
            {t("catalog.clear")}
          </button>
        )}
      </div>
      <details
        className="catalog-filter-details"
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>{t("catalog.filters")}</summary>
        <div className="catalog-facets">
          {(["goal", "genre", "instrument", "tradition"] as const).map((field) => {
            const fieldId = id === "catalog" ? `filter-${field}` : `${id}-filter-${field}`;
            return (
              <label key={field} htmlFor={fieldId}>
                {t(field === "goal" ? "home.today" : `catalog.${field}`)}
                <select
                  id={fieldId}
                  value={query[field] || ""}
                  onChange={(event) => navigate({ [field]: event.target.value })}
                >
                  <option value="">{t("common.all")}</option>
                  {(field === "goal" ? ["relax", "rest", "focus"] : taxonomy[field]).map(
                    (value) => (
                      <option key={value} value={value}>
                        {t(field === "goal" ? `goals.${value}` : `taxonomy.${field}.${value}`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            );
          })}
        </div>
      </details>
    </>
  );
}
