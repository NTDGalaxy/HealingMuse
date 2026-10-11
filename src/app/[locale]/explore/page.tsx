import { Suspense } from "react";
import { ExploreView } from "@/components/catalog";
import { CatalogLoading } from "@/components/catalog-loading";
import { catalogQueryInput, decodeCursor } from "@/lib/catalog-query";
import { getCatalogPage } from "@/lib/server/catalog";
import type { CatalogQuery } from "@/lib/types";
async function Results({ query }: { query: CatalogQuery }) {
  const page = await getCatalogPage(query).catch(() => null);
  return page ? (
    <ExploreView query={query} initialPage={page} />
  ) : (
    <ExploreView query={query} unavailable />
  );
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = catalogQueryInput.safeParse(await searchParams);
  let query: CatalogQuery = parsed.success ? { ...parsed.data, status: "" } : {};
  try {
    decodeCursor(query.cursor);
  } catch {
    query = { ...query, cursor: "" };
  }
  return (
    <Suspense key={JSON.stringify(query)} fallback={<CatalogLoading />}>
      <Results query={query} />
    </Suspense>
  );
}
