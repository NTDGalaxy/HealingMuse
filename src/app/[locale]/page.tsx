import { HomeIntro, HomeView } from "@/components/catalog";
import { getCatalogPage, getCollections, getTracksByIds } from "@/lib/server/catalog";
import { CatalogLoading } from "@/components/catalog-loading";
import { Suspense } from "react";
async function Content() {
  const result = await Promise.all([getCatalogPage({ limit: 12 }), getCollections()])
    .then(async ([page, collections]) => ({
      page,
      collections,
      collectionTracks: await getTracksByIds(
        [...new Set(collections.flatMap((collection) => collection.trackIds.slice(0, 4)))].slice(
          0,
          100,
        ),
      ),
    }))
    .catch(() => null);
  return result ? (
    <HomeView
      initialPage={result.page}
      initialCollections={result.collections}
      collectionTracks={result.collectionTracks}
      withIntro={false}
    />
  ) : (
    <HomeView unavailable withIntro={false} />
  );
}
export default function Page() {
  return (
    <div className="home-page">
      <HomeIntro />
      <Suspense fallback={<CatalogLoading />}>
        <Content />
      </Suspense>
    </div>
  );
}
