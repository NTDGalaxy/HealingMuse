import { ListMusic } from "lucide-react";

/** A calm placeholder for a list or screen with nothing to show yet, with optional actions. */
export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state" data-part="empty-state">
      <ListMusic size={36} aria-hidden="true" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}
