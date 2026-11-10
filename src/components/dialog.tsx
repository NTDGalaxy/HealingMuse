"use client";
import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { onDemand, useOnDemand } from "@/lib/on-demand";
import { useAppActions } from "./app-state";
import type DialogContent from "./dialog-content";

/** Radix and the dialog chrome: downloaded on first use, or ahead of it by the Shell's preload. */
export const dialogCode = onDemand(() =>
  import("./dialog-content").then((module) => module.default),
);

export function Dialog(props: ComponentProps<typeof DialogContent>) {
  const t = useTranslations("errors");
  const { announce } = useAppActions();
  // Load on first use, then let Radix Presence finish closing and restore focus.
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  const code = useOnDemand(dialogCode, props.open, () => {
    // The connection dropped before the dialog code arrived: stay closed, say so calmly and let
    // the page (and anything playing) carry on. Opening it again retries the download.
    props.onOpenChange(false);
    announce(t("unavailable"));
  });
  if (!opened || code.state !== "loaded") return null;
  const Content = code.value;
  return <Content {...props} />;
}
