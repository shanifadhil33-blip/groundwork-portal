'use client';
/** Avatar, name and role on one line. */
export function AccountIdentity({ name, role, compact = false }: { name: string | null; role: string; compact?: boolean }) {
  const label = name ?? 'Account';
  return <>
    <span data-no-translate className="user-initials" aria-hidden="true">{label.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>
    {!compact && <span className="account-copy"><strong dir="auto" data-no-translate><bdi>{label}</bdi></strong><small>{role}</small></span>}
  </>;
}
