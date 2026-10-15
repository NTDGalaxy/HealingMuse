"use client";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(useGSAP, ScrollTrigger);
export default function GardenMotion({
  pathname,
  calm,
  still,
}: {
  pathname: string;
  calm: boolean;
  still: boolean;
}) {
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      if (calm) return;
      media.add(
        { motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1100px)" },
        (condition) => {
          if (!condition.conditions?.motion) return;
          const main = document.getElementById("main-content");
          if (!main) return;
          const context = gsap.context(() => {
            const heading = main.querySelector("h1");
            if (heading)
              gsap.from(heading, {
                y: 12,
                opacity: 0.82,
                duration: 0.65,
                ease: "expo.out",
                clearProps: "transform,opacity",
              });
            const scene = document.getElementById("sanctuary-scenery");
            if (scene) {
              gsap.fromTo(
                scene,
                { opacity: 0.65 },
                { opacity: 1, duration: 0.8, ease: "power2.out", clearProps: "opacity" },
              );
              if (!still)
                gsap.to(scene, {
                  y: -22,
                  ease: "none",
                  scrollTrigger: {
                    trigger: main,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: 0.6,
                  },
                });
            }
          });
          const observed = new WeakSet<Element>();
          const observe = () =>
            context.add(() => {
              let changed = false;
              main
                .querySelectorAll(
                  ".listening-paths, .collection-section, .home-more-recordings, .binaural-education",
                )
                .forEach((section) => {
                  if (observed.has(section)) return;
                  observed.add(section);
                  changed = true;
                  gsap.from(section, {
                    y: 20,
                    duration: 0.8,
                    ease: "expo.out",
                    scrollTrigger: { trigger: section, start: "top 94%", once: true },
                    clearProps: "transform",
                  });
                  if (condition.conditions?.desktop) {
                    const art = section.querySelectorAll(".nature-art");
                    if (art.length)
                      gsap.from(art, {
                        scale: 0.95,
                        scrollTrigger: {
                          trigger: section,
                          start: "top 95%",
                          end: "top 40%",
                          scrub: 0.6,
                        },
                      });
                    if (section.matches(".collection-section")) {
                      const heading = section.querySelector(".section-heading");
                      if (heading)
                        ScrollTrigger.create({
                          trigger: section,
                          pin: heading,
                          start: "top 100px",
                          end: "bottom 65%",
                          pinSpacing: false,
                        });
                    }
                  }
                });
              if (changed) ScrollTrigger.refresh();
            });
          observe();
          const observer = new MutationObserver(observe);
          observer.observe(main, { childList: true, subtree: true });
          return () => {
            observer.disconnect();
            context.revert();
          };
        },
      );
      return () => media.revert();
    },
    { dependencies: [pathname, calm, still], revertOnUpdate: true },
  );
  return null;
}
