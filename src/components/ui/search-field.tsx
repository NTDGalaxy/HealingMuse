import type { ComponentProps, Key } from "react";
import { Search } from "lucide-react";

/**
 * A search form: an optional leading icon, a visually hidden label, the `q` input and a submit
 * button that repeats the label. Form attributes (action, onSubmit) pass through.
 */
export function SearchField({
  id,
  label,
  placeholder,
  iconSize,
  className,
  input,
  inputKey,
  submitType,
  ...form
}: Omit<ComponentProps<"form">, "className" | "children"> & {
  id: string;
  label: string;
  placeholder: string;
  /** Size of the leading search icon; without it the form has no icon. */
  iconSize?: number;
  /** An extra class beside `search-box`. */
  className?: string;
  /** Further input attributes, such as a default value. */
  input?: Omit<ComponentProps<"input">, "id" | "name" | "type" | "maxLength" | "placeholder">;
  /** Remounts the input when it changes, so a default value follows the current query. */
  inputKey?: Key;
  submitType?: "submit";
}) {
  return (
    <form
      className={className ? `search-box ${className}` : "search-box"}
      data-part="search-field"
      {...form}
    >
      {iconSize !== undefined && <Search size={iconSize} aria-hidden="true" />}
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        key={inputKey}
        id={id}
        name="q"
        type="search"
        maxLength={120}
        placeholder={placeholder}
        {...input}
      />
      <button className="button" type={submitType}>
        {label}
      </button>
    </form>
  );
}
