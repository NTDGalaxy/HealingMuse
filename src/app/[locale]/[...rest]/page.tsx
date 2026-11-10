import { notFound } from "next/navigation";

/** Any path under a locale that names no route renders the localized not-found page. */
export default function UnknownRoute(): never {
  notFound();
}
