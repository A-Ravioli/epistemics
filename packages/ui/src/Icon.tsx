import type { SVGAttributes } from 'react';

/** Inline 16px stroke icons: the whole set the app uses, so no icon library is shipped. */
const PATHS = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>,
  back: <><path d="M9.5 3.5 5 8l4.5 4.5" /><path d="M5 8h8" /></>,
  forward: <><path d="M6.5 3.5 11 8l-4.5 4.5" /><path d="M11 8H3" /></>,
  settings: <><path d="M3 5h10M3 11h10" /><circle cx="6" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="10" cy="11" r="1.5" fill="currentColor" stroke="none" /></>,
  gear: <><circle cx="8" cy="8" r="2.25" /><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" /></>,
  plus: <path d="M8 3v10M3 8h10" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  'chevron-down': <path d="M3.5 6 8 10.5 12.5 6" />,
  'chevron-up': <path d="M3.5 10 8 5.5 12.5 10" />,
  book: <><path d="M2.5 3.5A1.5 1.5 0 0 1 4 2h4v11H4a1.5 1.5 0 0 0-1.5 1.5z" /><path d="M13.5 3.5A1.5 1.5 0 0 0 12 2H8v11h4a1.5 1.5 0 0 1 1.5 1.5z" /></>,
  map: <><path d="M2 4.5 6 3l4 1.5L14 3v8.5L10 13l-4-1.5L2 13z" /><path d="M6 3v8.5M10 4.5V13" /></>,
  chart: <><path d="M2.5 13.5h11" /><path d="M4.5 11V7M8 11V3.5M11.5 11V6" /></>,
  user: <><circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 14a5.25 5.25 0 0 1 10.5 0" /></>,
  today: <><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 7h11M5.5 2v3M10.5 2v3" /></>,
  shelf: <><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h11" /><path d="M4.5 3.5V8M8 8v4.5M11.5 3.5V8" /></>,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  sidebar: <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6.5 3v10" /></>,
  compose: <><path d="M13 2.5 8 7.5l-.5 2 2-.5 5-5a1.06 1.06 0 0 0-1.5-1.5z" /><path d="M12.5 9.5v3a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3" /></>,
  more: <><circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" /></>,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="2" /><path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" /></>,
  cube: <><path d="M8 2 13.5 5v6L8 14 2.5 11V5z" /><path d="M2.5 5 8 8l5.5-3M8 8v6" /></>,
  spark: <><path d="M8 2.5 9.3 6.2 13 7.5l-3.7 1.3L8 12.5 6.7 8.8 3 7.5l3.7-1.3z" /></>,
  comment: <><path d="M13.5 8.5a4.5 4.5 0 0 1-4.5 4.5H5l-2.5 1.5.75-2.4A4.5 4.5 0 0 1 6.5 4h2a4.5 4.5 0 0 1 5 4.5z" /></>,
  plug: <><path d="M6 2v3.5M10 2v3.5" /><path d="M4 5.5h8v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4z" /><path d="M8 11.5V14" /></>,
  bolt: <path d="M9 2 4 9h3.5L7 14l5-7H8.5z" />,
  'check-square': <><rect x="2.5" y="2.5" width="11" height="11" rx="3" /><path d="M5.5 8.2 7.3 10l3.2-3.6" /></>,
  command: <path d="M5.5 2.5a1.5 1.5 0 1 0 0 3h5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3v5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3h-5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />,
  'arrow-right': <><path d="M3 8h10" /><path d="M9 4l4 4-4 4" /></>,
  play: <path d="M5.5 3.5 12 8l-6.5 4.5z" />,
  trash: <><path d="M3.5 4.5h9" /><path d="M6.5 4.5V3h3v1.5" /><path d="M4.75 4.5 5.3 13a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.55-8.5" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = '', ...rest }: { name: IconName; size?: number } & Omit<SVGAttributes<SVGSVGElement>, 'name'>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
