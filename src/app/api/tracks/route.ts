import { getTracksByIds } from "@/lib/server/catalog";
import { uuid } from "@/lib/validation";
import { HttpError, json, safeHandler } from "@/lib/server/http";
export function GET(request: Request) {
  return safeHandler(async () => {
    const ids = new URL(request.url).searchParams.get("ids")?.split(",") || [];
    if (!ids.length || ids.length > 100 || ids.some((id) => !uuid.safeParse(id).success))
      throw new HttpError(400, "invalid");
    return json(await getTracksByIds([...new Set(ids)]));
  });
}
