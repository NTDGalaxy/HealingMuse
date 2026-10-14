/* No account data is read or saved by this offline shell. */
(async () => {
  const locale = location.pathname.startsWith("/en") ? "en" : "vi";
  document.documentElement.lang = locale;
  const strings = await (await fetch(`/offline/${locale}.json`)).json();
  const text = (key, values = {}) =>
    key
      .split(".")
      .reduce((value, part) => value[part], strings)
      .replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  const el = (id) => document.getElementById(id);
  const set = (id, key) => {
    el(id).textContent = text(key);
  };
  for (const [id, key] of [
    ["skip", "nav.skip"],
    ["connection", "common.offline"],
    ["title", "downloads.title"],
    ["subtitle", "downloads.subtitle"],
    ["note", "downloads.note"],
    ["retry", "common.retry"],
    ["timer-label", "player.timer"],
    ["current", "player.idle"],
  ])
    set(id, key);
  el("brand").href = `/${locale}`;
  el("audio").setAttribute("aria-label", text("player.nowPlaying"));
  document.querySelector("nav").setAttribute("aria-label", text("settings.language"));
  document.querySelector(".player").setAttribute("aria-label", text("player.nowPlaying"));
  const audio = el("audio");
  let objectUrl = null;
  let deadline = null;
  let currentId = null;
  for (const option of el("timer").options)
    option.textContent = Number(option.value)
      ? text("common.minutes", { count: option.value })
      : text("player.timerOff");
  el("timer").onchange = () => {
    deadline = Number(el("timer").value) ? Date.now() + Number(el("timer").value) * 60000 : null;
  };
  const tick = () => {
    if (deadline && Date.now() >= deadline) {
      deadline = null;
      audio.pause();
      el("timer").value = "0";
      set("status", "player.timerEnded");
    }
  };
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", tick);
  el("retry").onclick = () => location.reload();
  audio.onerror = () => set("status", "player.playbackError");
  async function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("healingmuse-downloads", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("recordings", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function records() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recordings", "readonly");
      const request = tx.objectStore("recordings").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async function remove(id) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async function render() {
    try {
      const items = await records();
      const list = el("list");
      list.replaceChildren();
      el("empty").textContent = items.length ? "" : text("downloads.emptyText");
      el("usage").textContent = text("downloads.used", {
        size: `${(items.reduce((sum, item) => sum + item.bytes, 0) / 1048576).toFixed(1)} MB`,
      });
      for (const item of items) {
        const article = document.createElement("article");
        article.className = "recording";
        const title = document.createElement("h2");
        title.textContent = item.track.title[locale];
        const artist = document.createElement("p");
        artist.textContent = item.track.artist;
        const actions = document.createElement("div");
        actions.className = "actions";
        const play = document.createElement("button");
        play.textContent = text("common.play");
        play.setAttribute("aria-label", text("catalog.playTitle", { title: title.textContent }));
        play.onclick = () => {
          audio.pause();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          currentId = item.id;
          objectUrl = URL.createObjectURL(item.blob);
          audio.src = objectUrl;
          el("current").textContent = title.textContent;
          if ("mediaSession" in navigator)
            navigator.mediaSession.metadata = new MediaMetadata({
              title: title.textContent,
              artist: item.track.artist,
              album: "HealingMuse",
            });
          audio
            .play()
            .then(() => {
              el("status").textContent = text("player.playingStatus", { title: title.textContent });
            })
            .catch(() => set("status", "player.cannotAutoplay"));
        };
        const deletion = document.createElement("button");
        deletion.className = "remove";
        deletion.textContent = text("common.remove");
        deletion.setAttribute("aria-label", `${text("common.remove")}: ${title.textContent}`);
        deletion.onclick = async () => {
          try {
            await remove(item.id);
            if (currentId === item.id) {
              audio.pause();
              audio.removeAttribute("src");
              audio.load();
              if (objectUrl) URL.revokeObjectURL(objectUrl);
              objectUrl = null;
              currentId = null;
              set("current", "player.idle");
            }
            await render();
            el("retry").focus();
          } catch {
            set("status", "downloads.unsupported");
          }
        };
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = text("catalog.credit");
        const attribution = document.createElement("p");
        attribution.textContent = item.track.attribution;
        const license = document.createElement("a");
        license.href = item.track.licenseUrl;
        license.textContent = item.track.license;
        license.target = "_blank";
        license.rel = "noopener noreferrer";
        const provenance = document.createElement("a");
        provenance.href = item.track.provenanceUrl;
        provenance.textContent = text("catalog.source");
        provenance.target = "_blank";
        provenance.rel = "noopener noreferrer";
        const changes = document.createElement("p");
        changes.textContent = item.track.changes || "";
        details.append(
          summary,
          attribution,
          license,
          document.createElement("br"),
          provenance,
          changes,
        );
        actions.append(play, deletion);
        article.append(title, artist, actions, details);
        list.append(article);
      }
    } catch {
      set("empty", "downloads.unsupported");
    }
  }
  if ("mediaSession" in navigator) {
    const handlers = {
      play: () => audio.play().catch(() => set("status", "player.cannotAutoplay")),
      pause: () => audio.pause(),
      seekto: (event) => {
        if (event.seekTime !== undefined) audio.currentTime = event.seekTime;
      },
      seekbackward: (event) => {
        audio.currentTime = Math.max(0, audio.currentTime - (event.seekOffset || 10));
      },
      seekforward: (event) => {
        audio.currentTime = Math.min(
          audio.duration || 0,
          audio.currentTime + (event.seekOffset || 10),
        );
      },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* Device action is unavailable. */
      }
    }
    audio.onplay = () => {
      navigator.mediaSession.playbackState = "playing";
    };
    audio.onpause = () => {
      navigator.mediaSession.playbackState = "paused";
    };
  }
  await render();
})();
