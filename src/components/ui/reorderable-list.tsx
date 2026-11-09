"use client";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

export interface ReorderableItem {
  id: string;
  label: string;
}

/** Moves the item at `index` one place towards `offset` (-1 up, 1 down). */
export function moveItem(ids: readonly string[], index: number, offset: -1 | 1): string[] {
  const next = [...ids];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** An ordered list edited with move up, move down and remove buttons, all keyboard operable. */
export function ReorderableList({
  items,
  onChange,
  iconSize,
}: {
  items: readonly ReorderableItem[];
  onChange: (ids: string[]) => void;
  iconSize: number;
}) {
  const t = useTranslations();
  const ids = items.map((item) => item.id);
  return (
    <ol className="edit-list">
      {items.map(({ id, label }, index) => (
        <li key={id}>
          <span>{label}</span>
          <button
            type="button"
            className="icon-button"
            disabled={index === 0}
            aria-label={t("library.moveUp", { title: label })}
            onClick={() => onChange(moveItem(ids, index, -1))}
          >
            <ArrowUp size={iconSize} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={index === items.length - 1}
            aria-label={t("library.moveDown", { title: label })}
            onClick={() => onChange(moveItem(ids, index, 1))}
          >
            <ArrowDown size={iconSize} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`${t("common.remove")}: ${label}`}
            onClick={() => onChange(ids.filter((other) => other !== id))}
          >
            <Trash2 size={iconSize} />
          </button>
        </li>
      ))}
    </ol>
  );
}
