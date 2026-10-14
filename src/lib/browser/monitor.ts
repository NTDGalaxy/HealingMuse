type Event = "playback_failed" | "authentication_failed" | "synchronization_failed";
const last = new Map<Event, number>();
export function monitor(event: Event) {
  if (!navigator.onLine || Date.now() - (last.get(event) ?? 0) < 30000) return;
  last.set(event, Date.now());
  // The only transmitted value is a fixed event name.
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    cache: "no-store",
    credentials: "omit",
    keepalive: true,
  }).catch(() => {});
}
