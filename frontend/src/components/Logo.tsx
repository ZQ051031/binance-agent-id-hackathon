export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <defs>
        <linearGradient id="tm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="32" height="32" rx="9" fill="#0f172a" stroke="url(#tm)" strokeWidth="2" />
      <g stroke="url(#tm)" strokeWidth="2" fill="none">
        <path d="M9 11 L17 8 L25 11 L25 23 L17 26 L9 23 Z" />
        <path d="M9 11 L17 17 L25 11 M17 17 L17 26" />
      </g>
    </svg>
  );
}
