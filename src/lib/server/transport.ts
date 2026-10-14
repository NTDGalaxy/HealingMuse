import "server-only";
import https from "node:https";
import { lookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 16,
  maxTotalSockets: 32,
  timeout: 10000,
});
const addresses = new Map<string, { until: number; items: LookupAddress[] }>();
function resolveAddresses(
  host: string,
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<LookupAddress[]> {
  const cached = addresses.get(host);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.items);
  return new Promise((resolve, reject) => {
    const fail = () => {
      cleanup();
      reject(signal?.reason || new DOMException("Server request deadline exceeded", "AbortError"));
    };
    const timer = setTimeout(fail, Math.max(1, deadline - Date.now()));
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", fail);
    };
    signal?.addEventListener("abort", fail, { once: true });
    if (signal?.aborted) {
      fail();
      return;
    }
    const finish = (error: NodeJS.ErrnoException | null, items: LookupAddress[]) => {
      cleanup();
      if (error) return reject(error);
      addresses.set(host, { until: Date.now() + 30000, items });
      resolve(items);
    };
    // Query A records first. AF_UNSPEC waits for a slow AAAA resolver in this environment.
    lookup(host, { family: 4, all: true }, (error, items) => {
      if (!error && items.length) finish(null, items);
      else lookup(host, { family: 6, all: true }, finish);
    });
  });
}
/** Verified TLS, pooled sockets and one bounded deadline across address fallback. */
export const serverFetch: typeof fetch = async (input, init = {}) => {
  const original = input instanceof Request ? input : null;
  const url = new URL(original?.url || String(input));
  if (
    url.protocol !== "https:" ||
    url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local").origin
  )
    throw new Error("Unsupported server transport destination");
  const signal = init.signal || original?.signal;
  if (signal?.aborted) throw signal.reason || new DOMException("Request aborted", "AbortError");
  const deadline = Date.now() + 5000;
  const payload =
    init.body ??
    (original && !["GET", "HEAD"].includes(original.method)
      ? await original.arrayBuffer()
      : undefined);
  const body =
    payload instanceof Blob
      ? Buffer.from(await payload.arrayBuffer())
      : payload instanceof ArrayBuffer
        ? Buffer.from(payload)
        : payload;
  if (body != null && typeof body !== "string" && !ArrayBuffer.isView(body))
    throw new Error("Unsupported server request body");
  const candidates = await resolveAddresses(url.hostname, signal || undefined, deadline);
  let last: unknown = new Error("No server address available");
  for (let index = 0; index < Math.min(candidates.length, 3); index++) {
    if (signal?.aborted) throw signal.reason || new DOMException("Request aborted", "AbortError");
    if (Date.now() >= deadline)
      throw new DOMException("Server request deadline exceeded", "AbortError");
    const address = candidates[index];
    // Pin one verified address per attempt. Automatic family racing is unreliable in this WSL environment.
    const pinnedLookup: LookupFunction = (_hostname, _options, done) =>
      done(null, address.address, address.family);
    try {
      return await new Promise<Response>((resolve, reject) => {
        const options = {
          agent,
          method: init.method || original?.method || "GET",
          headers: Object.fromEntries(new Headers(init.headers || original?.headers)),
          lookup: pinnedLookup,
          family: address.family,
          autoSelectFamily: false,
        };
        const request = https.request(url, options);
        let received = false;
        const abort = () =>
          request.destroy(
            signal?.reason instanceof Error
              ? signal.reason
              : new DOMException("Request aborted", "AbortError"),
          );
        const timer = setTimeout(
          () => request.destroy(new DOMException("Server request deadline exceeded", "AbortError")),
          Math.min(index < candidates.length - 1 ? 2000 : 5000, Math.max(1, deadline - Date.now())),
        );
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        signal?.addEventListener("abort", abort, { once: true });
        request.on("error", (error) => {
          cleanup();
          reject(error);
        });
        request.on("response", (response) => {
          received = true;
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 16 * 1024 * 1024) request.destroy(new Error("Server response too large"));
            else chunks.push(chunk);
          });
          response.on("error", (error) => {
            cleanup();
            reject(error);
          });
          response.on("aborted", () => {
            cleanup();
            reject(new Error("Server response interrupted"));
          });
          response.on("end", () => {
            cleanup();
            const headers = new Headers();
            for (const [name, value] of Object.entries(response.headers))
              if (value !== undefined)
                headers.set(name, Array.isArray(value) ? value.join(", ") : value);
            const status = response.statusCode || 502;
            if (status >= 300 && status < 400)
              return reject(new Error("Unexpected server redirect"));
            resolve(
              new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
                status,
                headers,
              }),
            );
          });
        });
        request.once("error", (error) => {
          if (received) Object.assign(error, { responseStarted: true });
        });
        request.end(body);
      });
    } catch (error) {
      last = error;
      // Never replay a request after the server may have processed it.
      if (
        (error as { responseStarted?: boolean }).responseStarted ||
        !["GET", "HEAD"].includes(init.method || original?.method || "GET") ||
        signal?.aborted
      )
        throw error;
    }
  }
  throw last;
};
