import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns";

/** Bounded native transport for offline import tools, preserving TLS hostname verification. */
export async function toolFetch(input, init = {}) {
  const url = new URL(input);
  const transport = url.protocol === "https:" ? https : url.protocol === "http:" ? http : null;
  if (!transport) throw new Error("unsupported_transport");
  const body = init.body instanceof Blob ? Buffer.from(await init.body.arrayBuffer()) : init.body;
  if (body !== undefined && typeof body !== "string" && !ArrayBuffer.isView(body))
    throw new Error("unsupported_tool_request_body");
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) return reject(new Error("request_aborted"));
    const request = transport.request(url, {
      method: init.method || "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      // Node's native verified HTTPS path avoids intermittent Undici connection failures in WSL.
      autoSelectFamily: false,
      lookup: (host, _options, done) => lookup(host, { family: 4 }, done),
    });
    const abort = () => request.destroy(new Error("request_aborted"));
    const deadline = setTimeout(() => request.destroy(new Error("request_timeout")), 60000);
    const clear = () => {
      clearTimeout(deadline);
      init.signal?.removeEventListener("abort", abort);
    };
    init.signal?.addEventListener("abort", abort, { once: true });
    request.on("error", (error) => {
      clear();
      reject(error);
    });
    request.on("response", (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) request.destroy(new Error("response_too_large"));
        else chunks.push(chunk);
      });
      response.on("error", (error) => {
        clear();
        reject(error);
      });
      response.on("end", () => {
        clear();
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        const status = response.statusCode || 502;
        resolve(
          new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
            status,
            headers,
          }),
        );
      });
    });
    request.end(body);
  });
}
