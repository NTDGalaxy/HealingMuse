import type { AnchorHTMLAttributes } from "react";
// Behaves like next/link: a plain primary click navigates on the client, so the document (and
// the single persistent <audio>) survives. Modified clicks and new tabs stay native.
export default function Link({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          !props.href
        )
          return;
        event.preventDefault();
        history.pushState(null, "", props.href);
        window.dispatchEvent(new Event("healingmuse-fixture-route"));
      }}
    />
  );
}
