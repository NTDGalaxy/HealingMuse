"use client";
import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

export interface ReorderableItem {
  id: string;
  label: string;
}

type Action = "up" | "down" | "remove";

/** Moves the item at `index` one place towards `offset` (-1 up, 1 down). */
export function moveItem(ids: readonly string[], index: number, offset: -1 | 1): string[] {
  const next = [...ids];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Where keyboard focus goes after an action, given the items it produced: the moved item's
 * control, or its other move control once it reaches an end; after a removal, the remove control
 * of the item that took its place, else of the one before it.
 */
export function focusAfter(
  action: Action,
  id: string,
  index: number,
  ids: readonly string[],
): { id: string; action: Action } | null {
  if (action === "remove") {
    const next = ids[Math.min(index, ids.length - 1)];
    return next === undefined ? null : { id: next, action: "remove" };
  }
  const position = ids.indexOf(id);
  if (position === -1) return null;
  if (action === "up" && position === 0) return { id, action: ids.length > 1 ? "down" : "remove" };
  if (action === "down" && position === ids.length - 1)
    return { id, action: ids.length > 1 ? "up" : "remove" };
  return { id, action };
}

/**
 * An ordered list edited with move up, move down and remove buttons. Keyboard focus stays in the
 * list: a control that becomes disabled or disappears hands focus to the nearest useful one.
 */
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
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<{ id: string; action: Action } | null>(null);
  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    controls.current.get(`${target.id}:${target.action}`)?.focus();
  });
  const control = (id: string, action: Action) => (node: HTMLButtonElement | null) => {
    if (node) controls.current.set(`${id}:${action}`, node);
    else controls.current.delete(`${id}:${action}`);
  };
  const act = (action: Action, id: string, index: number, next: string[]) => {
    pending.current = focusAfter(action, id, index, next);
    onChange(next);
  };
  return (
    <ol className="edit-list">
      {items.map(({ id, label }, index) => (
        <li key={id}>
          <span>{label}</span>
          <button
            ref={control(id, "up")}
            type="button"
            className="icon-button"
            disabled={index === 0}
            aria-label={t("library.moveUp", { title: label })}
            onClick={() => act("up", id, index, moveItem(ids, index, -1))}
          >
            <ArrowUp size={iconSize} />
          </button>
          <button
            ref={control(id, "down")}
            type="button"
            className="icon-button"
            disabled={index === items.length - 1}
            aria-label={t("library.moveDown", { title: label })}
            onClick={() => act("down", id, index, moveItem(ids, index, 1))}
          >
            <ArrowDown size={iconSize} />
          </button>
          <button
            ref={control(id, "remove")}
            type="button"
            className="icon-button"
            aria-label={`${t("common.remove")}: ${label}`}
            onClick={() =>
              act(
                "remove",
                id,
                index,
                ids.filter((other) => other !== id),
              )
            }
          >
            <Trash2 size={iconSize} />
          </button>
        </li>
      ))}
    </ol>
  );
}
