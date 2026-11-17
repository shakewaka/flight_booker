type EmblemProps = {
  className?: string;
};

/** 架空の国「NOVA REPUBLIC」の紋章。星と、左右に広がる翼。 */
export function Emblem({ className }: EmblemProps) {
  return (
    <svg className={className} viewBox="0 0 120 100" aria-hidden="true" fill="currentColor">
      <circle cx="60" cy="48" r="27" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="48" r="22" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path d="M60 28l4.6 13.2 14 .4-11.1 8.5 4 13.4L60 55.6l-11.5 7.9 4-13.4-11.1-8.5 14-.4z" />
      <path d="M30 40C18 38 9 42 3 52c9-4 17-4 25 0-7 0-13 3-17 9 8-3 15-3 21 1-4 1-8 4-10 8 8-2 15-1 21 4-7-9-12-21-13-34z" />
      <path d="M90 40c12-2 21 2 27 12-9-4-17-4-25 0 7 0 13 3 17 9-8-3-15-3-21 1 4 1 8 4 10 8-8-2-15-1-21 4 7-9 12-21 13-34z" />
      <path d="M38 86h44v3H38zM46 92h28v2.5H46z" />
    </svg>
  );
}
