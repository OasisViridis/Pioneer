/** Small monochrome identity mark; labels carry all functional meaning. */
export function HazelMark(): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 17C4 12 5 5 9 6C12 7 12 11 13 12C15 11 17 11 19 12C20 8 21 5 24 6C28 7 27 13 26 17C29 20 29 25 25 27C22 29 19 27 16 28C13 27 10 29 7 27C3 25 3 20 6 17Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M11 20V22M21 20V22"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
