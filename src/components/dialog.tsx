"use client";
import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import type DialogContent from "./dialog-content";
const Content = dynamic(() => import("./dialog-content"), { ssr: false });
export function Dialog(props: ComponentProps<typeof DialogContent>) {
  // Load on first use, then let Radix Presence finish closing and restore focus.
  const [opened, setOpened] = useState(props.open);
  if (props.open && !opened) setOpened(true);
  return opened ? <Content {...props} /> : null;
}
