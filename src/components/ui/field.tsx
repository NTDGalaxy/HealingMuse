import type { ComponentProps, ReactNode } from "react";

// The form field family. Each control renders its <label> immediately before it, as siblings,
// so callers keep their own wrappers (a grid cell, a form stack) around the pair.

type Labelled = { id: string; label: ReactNode };

export function TextField({ id, label, ...input }: Labelled & Omit<ComponentProps<"input">, "id">) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
    </>
  );
}

export function TextAreaField({
  id,
  label,
  ...textarea
}: Labelled & Omit<ComponentProps<"textarea">, "id">) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} {...textarea} />
    </>
  );
}

export function SelectField({
  id,
  label,
  children,
  ...select
}: Labelled & Omit<ComponentProps<"select">, "id">) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...select}>
        {children}
      </select>
    </>
  );
}

/** A checkbox wrapped in its label. `row` is the full-width attestation layout. */
export function CheckboxField({
  label,
  row = false,
  ...input
}: { label: ReactNode; row?: boolean } & Omit<ComponentProps<"input">, "type">) {
  return (
    <label className={row ? "check-row" : "check-label"}>
      <input type="checkbox" {...input} />
      {label}
    </label>
  );
}
