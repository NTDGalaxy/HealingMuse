"use client";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { GraphicsMarker } from "@/lib/garden/budget-markers";
import { revealTargets } from "@/lib/garden/reveal-targets";
import { decorationMarks, decorationMayStart } from "@/lib/perf/audio-first";
import { useMotionPolicy } from "./motion-policy";
gsap.registerPlugin(useGSAP, ScrollTrigger);
// GSAP layer: content reveals, the scenery fade-in and scroll parallax. useMotionPolicy() decides
// what may run; a route or policy change reverts every tween, trigger and inline style before the
// layer runs again. Scenery mounts it anew, after decorationMayStart(), whenever the policy allows
// it again.
export default function GardenMotion({ pathname }: { pathname: string }) {
  const { reveals, parallax } = useMotionPolicy();
  // A recording may have started while this code downloaded, so the first pass waits for
  // decorationMayStart() once more. A route change before it resolves starts a new wait; once the
  // layer runs, route changes re-run it at once, before the new page paints.
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    performance.mark(decorationMarks.motionLoaded);
  }, []);
  const waitFor = allowed || !reveals ? null : pathname;
  useEffect(() => {
    if (waitFor === null) return;
    const wait = new AbortController();
    void decorationMayStart({ signal: wait.signal }).then((value) => value && setAllowed(true));
    return () => wait.abort();
  }, [waitFor]);
  const started = useRef(false);
  useGSAP(
    () => {
      if (!reveals || !allowed) return;
      const media = gsap.matchMedia();
      // "all" always matches; the desktop query re-runs the layer when the width crosses 1100 px.
      media.add({ always: "all", desktop: "(min-width: 1100px)" }, (condition) => {
        const main = document.getElementById("main-content");
        if (!main || typeof IntersectionObserver === "undefined") return;
        const context = gsap.context(() => {
          const scene = document.getElementById("sanctuary-scenery");
          if (scene) {
            gsap.fromTo(
              scene,
              { opacity: 0.65 },
              { opacity: 1, duration: 0.8, ease: "power2.out", clearProps: "opacity" },
            );
            if (parallax)
              gsap.to(scene, {
                y: -22,
                ease: "none",
                scrollTrigger: {
                  id: "healingmuse-graphics:motion" satisfies GraphicsMarker<"motion">,
                  trigger: main,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: 0.6,
                },
              });
          }
        });
        const observed = new WeakSet<Element>();
        const revealed = new WeakSet<Element>();
        const stationary = new WeakSet<Element>();
        const targets = revealTargets;
        const reveal = (elements: Element[]) =>
          context.add(() => {
            elements.forEach((element, index) => {
              if (revealed.has(element) || !element.isConnected) return;
              revealed.add(element);
              const delay = Math.min(index * 0.035, 0.14);
              gsap.from(element, {
                y: stationary.has(element) ? 0 : 14,
                opacity: 0.94,
                duration: 0.42,
                delay,
                ease: "expo.out",
                clearProps: "transform,opacity",
                overwrite: "auto",
              });
              const art = element.querySelector(".track-art .nature-art");
              if (art)
                gsap.from(art, {
                  opacity: 0.7,
                  duration: 0.42,
                  delay,
                  ease: "expo.out",
                  clearProps: "opacity",
                  overwrite: "auto",
                });
            });
          });
        // One observer handles streamed shelves, search results and route panels.
        // Nothing is hidden while it waits to enter the viewport.
        const entrance = new IntersectionObserver(
          (entries) => {
            const ready = entries.filter((entry) => entry.isIntersecting);
            ready.forEach((entry) => entrance.unobserve(entry.target));
            reveal(ready.map((entry) => entry.target));
          },
          { rootMargin: "0px 0px 80px 0px", threshold: 0 },
        );
        const observe = () =>
          context.add(() => {
            let changed = false;
            const ready: Element[] = [];
            main.querySelectorAll(targets).forEach((element) => {
              if (observed.has(element)) return;
              observed.add(element);
              // A surface owns its entrance; don't also animate its nested contents.
              if (element.parentElement?.closest(".panel, .legal-page, .credit-list")) return;
              const bounds = element.getBoundingClientRect();
              if (bounds.top < innerHeight && bounds.bottom > 0) {
                // Record this before observing. Later cards may move, initial targets may not.
                stationary.add(element);
                ready.push(element);
              } else entrance.observe(element);
            });
            reveal(ready);
            main.querySelectorAll(".collection-section").forEach((section) => {
              if (observed.has(section)) return;
              observed.add(section);
              changed = true;
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
            });
            if (changed) ScrollTrigger.refresh();
          });
        observe();
        if (!started.current) {
          started.current = true;
          performance.mark(decorationMarks.motion);
        }
        const observer = new MutationObserver((records) => {
          records.forEach((record) => {
            record.removedNodes.forEach((node) => {
              if (!(node instanceof Element)) return;
              entrance.unobserve(node);
              node.querySelectorAll(targets).forEach((target) => entrance.unobserve(target));
            });
            if (record.type !== "attributes") return;
            const grid = record.target as Element;
            if (grid.closest('[aria-busy="true"]')) return;
            grid.querySelectorAll(".track-card").forEach((card) => {
              observed.delete(card);
              revealed.delete(card);
              entrance.unobserve(card);
              gsap.killTweensOf(card);
              gsap.set(card, { clearProps: "transform,opacity" });
              const art = card.querySelector(".nature-art");
              if (art) {
                gsap.killTweensOf(art, "opacity");
                gsap.set(art, { clearProps: "opacity" });
              }
            });
          });
          // Ignore clock text, volume updates and other nonstructural changes.
          if (
            records.some(
              (record) =>
                record.type === "attributes" ||
                [...record.addedNodes].some((node) => node.nodeType === 1),
            )
          )
            observe();
        });
        observer.observe(main, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-result-key"],
        });
        return () => {
          observer.disconnect();
          entrance.disconnect();
          context.revert();
        };
      });
      return () => media.revert();
    },
    { dependencies: [pathname, reveals, parallax, allowed], revertOnUpdate: true },
  );
  return null;
}
