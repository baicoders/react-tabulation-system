// Pale identity tints for people, at least 60 degrees of hue apart. Identity only, never data colour.
const TINTS = ['#dcecf3', '#f6e3d3', '#e1efdc', '#efdcef', '#f3efd2', '#dde3f5'];

export function Initial({ name, index }: { name: string; index: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="initial" style={{ background: TINTS[index % TINTS.length] }} aria-hidden="true">
      {initials}
    </span>
  );
}
