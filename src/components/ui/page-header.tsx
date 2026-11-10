/** The heading block that opens a route: its title and one line of context. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-heading" data-part="page-heading">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}
