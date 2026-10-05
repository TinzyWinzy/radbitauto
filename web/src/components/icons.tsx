interface IconProps {
  className?: string;
}

function Base({ className = 'h-5 w-5', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CasesIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </Base>
  );
}

export function NewIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Base>
  );
}

export function TeamIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16 14.6c2.3.2 3.9 1.8 4.4 4.4" />
    </Base>
  );
}

export function AccountIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 7.5h16M4 12h16M4 16.5h16" />
      <circle cx="9" cy="7.5" r="2" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="15" cy="16.5" r="2" fill="currentColor" stroke="none" opacity="0.9" />
    </Base>
  );
}
