export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="muted">Not built yet. See docs/roadmap.md for what this screen will do.</p>
    </section>
  );
}
