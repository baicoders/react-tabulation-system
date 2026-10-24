// One outline icon set at 16px, 1.5px stroke, grey by default (inherits currentColor).
const PATHS = {
  events: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  candidates: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.9.7 3.1 2.4 3.5 5.2',
  groups: 'M4 6h16M4 12h16M4 18h10',
  rounds: 'M4 5h16M7 10h10M10 15h4M11 20h2',
  judges: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  reports: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
