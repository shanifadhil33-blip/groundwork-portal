'use client';
export function AccountIdentity({ name, role, context, compact = false }: { name: string | null; role: string; context: string; compact?: boolean }) {
  const label = name ?? 'Account';
  return <>
    <span data-no-translate className="user-initials" aria-hidden="true">{label.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>{' '}
    {!compact && <span className="account-copy"><strong dir="auto" data-no-translate><bdi>{label}</bdi></strong>{' '}<small dir="auto"><span>{role}</span> · <bdi data-no-translate>{context}</bdi></small></span>}
  </>;
}
