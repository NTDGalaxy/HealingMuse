import { Button, type ButtonVariant } from "./button";

export interface PageAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  type?: "button";
}

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
        <Button
          variant="secondary"
          type={back.type}
          disabled={back.disabled}
          onClick={back.onClick}
        >
          {back.label}
        </Button>
      )}
      {next && (
        <Button
          variant={nextVariant}
          type={next.type}
          disabled={next.disabled}
          onClick={next.onClick}
        >
          {next.label}
        </Button>
      )}
    </Group>
  );
}
