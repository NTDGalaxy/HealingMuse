"use client";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { api } from "@/lib/browser/api";
import type { CatalogPage } from "@/lib/types";

const emptyPage: CatalogPage = { items: [], total: 0, nextCursor: null };

type View = Readonly<{
  q: string;
  status: string;
  /** Cursors of the pages opened so far; the last one is the page shown ("" is the first). */
  cursors: readonly string[];
}>;

const pageUrl = ({ q, status, cursors }: View) =>
  `/api/admin/tracks?${new URLSearchParams({ q, status, cursor: cursors.at(-1)! })}`;

export interface AdminTracks {
  page: CatalogPage;
  status: string;
  /** Whether Back leads to an earlier page. */
  hasPrevious: boolean;
  search(q: string): void;
  filter(status: string): void;
  next(): void;
  /** Returns to the page before the current one. */
  back(): void;
  /** Reads the current page again; rejects when it cannot. */
  reload(): Promise<void>;
}

/**
 * Pages through the content studio's recordings. The API pages by opaque forward cursors, so the
 * cursors of the pages already opened are kept to step back one page at a time. `onLoad`
 * hears whether the latest page read succeeded.
 */
export function useAdminTracks(onLoad: (ok: boolean) => void): AdminTracks {
  const [view, setView] = useState<View>({ q: "", status: "", cursors: [""] });
  const [page, setPage] = useState<CatalogPage>(emptyPage);
  const report = useEffectEvent(onLoad);
  const url = pageUrl(view);
  useEffect(() => {
    const controller = new AbortController();
    void api<CatalogPage>(url, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        report(true);
        setPage(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) report(false);
      });
    return () => controller.abort();
  }, [url]);
  const reload = useCallback(async () => setPage(await api<CatalogPage>(url)), [url]);
  const nextCursor = page.nextCursor;
  return {
    page,
    status: view.status,
    hasPrevious: view.cursors.length > 1,
    search: (q) => setView((current) => ({ ...current, q, cursors: [""] })),
    filter: (status) => setView((current) => ({ ...current, status, cursors: [""] })),
    next: () =>
      setView((current) =>
        // A second press before the next page arrives would open the same page twice.
        !nextCursor || current.cursors.at(-1) === nextCursor
          ? current
          : { ...current, cursors: [...current.cursors, nextCursor] },
      ),
    back: () =>
      setView((current) =>
        current.cursors.length > 1
          ? { ...current, cursors: current.cursors.slice(0, -1) }
          : current,
      ),
    reload,
  };
}
