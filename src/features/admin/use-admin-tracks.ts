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
  /** The page on screen, which may still be the previous one while `ready` is false. */
  page: CatalogPage;
  /** Whether the page on screen is the one asked for; Next waits for it. */
  ready: boolean;
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
  // Each page is kept with the address it was read from, so a page still on screen while another
  // loads is never mistaken for it: its Next would follow the wrong cursor and skip a page.
  const [loaded, setLoaded] = useState<{ url: string; page: CatalogPage }>({
    url: "",
    page: emptyPage,
  });
  const report = useEffectEvent(onLoad);
  const url = pageUrl(view);
  useEffect(() => {
    const controller = new AbortController();
    void api<CatalogPage>(url, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        report(true);
        setLoaded({ url, page: data });
      })
      .catch(() => {
        if (!controller.signal.aborted) report(false);
      });
    return () => controller.abort();
  }, [url]);
  const reload = useCallback(
    async () => setLoaded({ url, page: await api<CatalogPage>(url) }),
    [url],
  );
  const ready = loaded.url === url;
  const nextCursor = ready ? loaded.page.nextCursor : null;
  return {
    page: loaded.page,
    ready,
    status: view.status,
    hasPrevious: view.cursors.length > 1,
    search: (q) => setView((current) => ({ ...current, q, cursors: [""] })),
    filter: (status) => setView((current) => ({ ...current, status, cursors: [""] })),
    // Next follows only the page asked for, so a press while another page loads can neither
    // open the same page twice nor skip one.
    next: () =>
      setView((current) =>
        nextCursor ? { ...current, cursors: [...current.cursors, nextCursor] } : current,
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
