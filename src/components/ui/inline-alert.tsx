/** An error announced next to the form or list it concerns. */
export function InlineAlert({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="error" role="alert">
      {children}
    </p>
  );
}
