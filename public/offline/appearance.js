/* Device-local appearance only; no account data or network requests. */
(function () {
  function apply() {
    let appearance = "system";
    try {
      const stored = JSON.parse(localStorage.getItem("healingmuse-appearance-v1") || "{}");
      if (["day", "night"].includes(stored.appearance)) appearance = stored.appearance;
    } catch {
      /* Follow the device if storage is unavailable. */
    }
    document.documentElement.dataset.theme =
      appearance === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "night"
          : "day"
        : appearance;
  }
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  addEventListener("storage", apply);
})();
