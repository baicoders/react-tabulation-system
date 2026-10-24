/** Tally's mark: four tally strokes crossed by a fifth, the oldest way to count. */
export function TallyMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 4v16M9.5 4v16M14 4v16M18.5 4v16M2.5 17L21.5 7" />
    </svg>
  );
}
