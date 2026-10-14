"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type DialogContent from "./dialog-content";
const Content = dynamic(() => import("./dialog-content"), { ssr: false });
export function Dialog(props: ComponentProps<typeof DialogContent>) {
  return props.open ? <Content {...props} /> : null;
}
