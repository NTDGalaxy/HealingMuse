import { Button, type ButtonVariant } from "./button";

export interface PageAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Unavailable only for a moment, such as while the page it would follow is still loading. It is
   * announced and shown as disabled but stays focusable, because a focused button that becomes
   * `disabled` loses keyboard focus to the page.
   */
  waiting?: boolean;
  type?: "button";
}

/** The attributes that make a page action unavailable, whether for good or for a moment. */
const availability = ({ disabled, waiting, onClick }: PageAction) => ({
  disabled,
  "aria-disabled": waiting || undefined,
  onClick: waiting ? undefined : onClick,
});

/**
 * Previous and next page controls. With a `label` they form a named navigation landmark;
 * without one they are a plain group inside a section that already names them.
 */
export function Pagination({
  label,
  back,
  next,
  nextVariant = "primary",
}: {
  label?: string;
  back?: PageAction | false | null;
  next?: PageAction | false | null;
  nextVariant?: ButtonVariant;
}) {
  const Group = label ? "nav" : "div";
  return (
    <Group className="catalog-pagination" aria-label={label}>
      {back && (
        <Button variant="secondary" type={back.type} {...availability(back)}>
          {back.label}
        </Button>
      )}
      {next && (
        <Button variant={nextVariant} type={next.type} {...availability(next)}>
          {next.label}
        </Button>
      )}
    </Group>
  );
}
