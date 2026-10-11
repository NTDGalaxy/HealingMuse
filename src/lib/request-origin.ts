export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || /[\\/?#@,%\s]/.test(host)) return false;
  try {
    const protocol = new URL(request.url).protocol;
    if (protocol !== "http:" && protocol !== "https:") return false;
    // Next can put its bound listener address in request.url while preserving the browser's Host.
    // Forwarded host headers are not a trusted replacement for the incoming authority.
    return origin === new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
}
