"use client";
import { useEffect } from "react";

const scenes: Record<string, string> = {
  "": "lake",
  explore: "valley",
  library: "forest",
  downloads: "coast",
  mood: "pool",
  settings: "hills",
};

export function Scenery({ pathname, calm }: { pathname: string; calm: boolean }) {
  const route = pathname.split("/")[2] ?? "";
  const scene = scenes[route] ?? "lake";
  useEffect(() => {
    const main = document.getElementById("main-content");
    const scenery = document.getElementById("sanctuary-scenery");
    if (!main || !scenery) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let stop = () => {};
    const configure = () => {
      stop();
      let storedCalm = false;
      try {
        storedCalm = localStorage.getItem("healingmuse-calm") === "true";
      } catch {
        /* Session preferences still work. */
      }
      if (calm || storedCalm || preference.matches) return;
      const animations = new Set<Animation>();
      const animate = (element: Element, frames: Keyframe[], duration: number) => {
        const animation = element.animate(frames, { duration, easing: "cubic-bezier(.16,1,.3,1)" });
        animations.add(animation);
        void animation.finished.then(
          () => animations.delete(animation),
          () => {},
        );
      };
      // Content is visible by default; no hidden state or scroll interception.
      const observed = new WeakSet<Element>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              observer.unobserve(entry.target);
              animate(
                entry.target,
                [{ transform: "translateY(12px)" }, { transform: "translateY(0)" }],
                480,
              );
            }
        },
        { threshold: 0.08 },
      );
      const observe = () => {
        const heading = main.querySelector("h1");
        if (heading && !observed.has(heading)) {
          observed.add(heading);
          animate(
            heading,
            [
              { transform: "translateY(10px)", opacity: 0.8 },
              { transform: "translateY(0)", opacity: 1 },
            ],
            420,
          );
        }
        for (const section of main.querySelectorAll("section"))
          if (!observed.has(section)) {
            observed.add(section);
            if (section.getBoundingClientRect().top > innerHeight) observer.observe(section);
          }
      };
      observe();
      const mutations = new MutationObserver(observe);
      mutations.observe(main, { childList: true, subtree: true });
      let frame = 0;
      const update = () => {
        frame = 0;
        scenery.style.setProperty("--scenic-shift", `${-Math.min(scrollY * 0.025, 14)}px`);
      };
      const scroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      update();
      window.addEventListener("scroll", scroll, { passive: true });
      stop = () => {
        observer.disconnect();
        mutations.disconnect();
        window.removeEventListener("scroll", scroll);
        cancelAnimationFrame(frame);
        for (const animation of animations) animation.cancel();
        scenery.style.removeProperty("--scenic-shift");
      };
    };
    configure();
    preference.addEventListener("change", configure);
    return () => {
      stop();
      preference.removeEventListener("change", configure);
    };
  }, [pathname, calm]);
  return (
    <div
      id="sanctuary-scenery"
      className={`sanctuary-scenery ${scenes[route] ? "" : "subdued"}`}
      aria-hidden="true"
    >
      <picture key={scene}>
        <source
          media="(max-width: 600px)"
          type="image/avif"
          srcSet={`/scenery/${scene}-480.avif`}
        />
        <source
          media="(max-width: 600px)"
          type="image/webp"
          srcSet={`/scenery/${scene}-480.webp`}
        />
        <source
          media="(max-width: 1100px)"
          type="image/avif"
          srcSet={`/scenery/${scene}-960.avif`}
        />
        <source type="image/avif" srcSet={`/scenery/${scene}-1600.avif`} />
        {/* Native picture serves already compressed static variants without an image proxy. */}
        <img
          src={`/scenery/${scene}-1600.webp`}
          width={1600}
          height={900}
          alt=""
          fetchPriority="low"
          decoding="async"
        />
      </picture>
    </div>
  );
}
