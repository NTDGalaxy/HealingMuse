import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonStyle {
  /** Primary is the filled action; secondary is the outlined one. */
  variant?: ButtonVariant;
  /** Destructive actions carry the danger tone on either variant. */
  danger?: boolean;
}

/** The class list of a button-styled control, for links that look like buttons. */
export function buttonClass({ variant = "primary", danger = false }: ButtonStyle = {}): string {
  return `button${variant === "secondary" ? " secondary" : ""}${danger ? " danger" : ""}`;
}

/** The application's text button. Every other attribute passes through to `<button>`. */
export function Button({
  variant,
  danger,
  ...props
}: ButtonStyle & Omit<ComponentProps<"button">, "className">) {
  return <button className={buttonClass({ variant, danger })} {...props} />;
}
