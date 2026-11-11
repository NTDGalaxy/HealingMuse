"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { taxonomy } from "@/lib/catalog-taxonomy";
import type { CatalogQuery } from "@/lib/types";
import { SearchField } from "./ui/search-field";

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
  const facetsId = `${id}-facets`;
  return (
    // One group: the search, then the kinds with the facets' disclosure ending their row, then the
    // facet panel across the group (a details element cannot open below a row it shares).
    <div className="catalog-controls">
      <SearchField
        id={`${id}-search`}
        iconSize={21}
        label={t("catalog.search")}
        placeholder={t("catalog.searchPlaceholder")}
        inputKey={query.q}
        input={{ defaultValue: query.q || "" }}
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: String(new FormData(event.currentTarget).get("q") || "").trim() });
        }}
      />
      <div className="catalog-control-row">
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
        <button
          type="button"
          className="catalog-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls={facetsId}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t("catalog.filters")}
        </button>
      </div>
      <div
        className="catalog-facets"
        id={facetsId}
        data-part="catalog-facets"
        hidden={!filtersOpen}
      >
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
                {(field === "goal" ? ["relax", "rest", "focus"] : taxonomy[field]).map((value) => (
                  <option key={value} value={value}>
                    {t(field === "goal" ? `goals.${value}` : `taxonomy.${field}.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
