import { getTranslations, setRequestLocale } from "next-intl/server";
import { BinauralPage } from "@/components/binaural-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "binaural" });
  return { title: t("title"), description: t("intro") };
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BinauralPage initialCatalogue={{ items: [], total: 0, nextCursor: null }} />;
}
