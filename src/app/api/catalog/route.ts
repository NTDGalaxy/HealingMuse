import { getCatalogPage } from "@/lib/server/catalog";
import { json, safeHandler, HttpError } from "@/lib/server/http";
import { catalogQueryInput, decodeCursor } from "@/lib/catalog-query";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return safeHandler(async () => {
    const parsed = catalogQueryInput.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success || parsed.data.status) throw new HttpError(400, "invalid");
    try {
      decodeCursor(parsed.data.cursor);
    } catch {
      throw new HttpError(400, "invalid");
    }
    return json(await getCatalogPage(parsed.data));
  });
}
