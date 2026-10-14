import { json, safeHandler } from "@/lib/server/http";
import { getCollections } from "@/lib/server/catalog";
export function GET() {
  return safeHandler(async () => json(await getCollections()));
}
