/** A panel announcing that content could not load, with the action that recovers from it. */
export function ErrorState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="info-panel" role="alert">
      <p>{message}</p>
      {action}
    </div>
  );
}
