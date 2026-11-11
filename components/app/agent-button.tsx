'use client';
import { useResource } from './resource';

/**
 * The one door to the Agent: a labelled pill with a monogram, the same on every screen and for every role.
 * Its code is warmed on hover, focus and touch start so the first open is instant.
 */
export function AgentButton({ open, onClick, onWarm }: { open: boolean; onClick: () => void; onWarm: () => void }) {
  const preferences = useResource<{ agent_name: string | null }>('/api/me/preferences');
  const name = preferences.data?.agent_name?.trim() || null;
  const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘J' : 'Ctrl J';
  return (
    <button type="button" className="agent-button" aria-haspopup="dialog" aria-expanded={open} title={`${name ?? 'Agent'} (${shortcut})`} suppressHydrationWarning onClick={onClick} onPointerEnter={onWarm} onFocus={onWarm} onTouchStart={onWarm}>
      <span className="agent-monogram" aria-hidden="true" data-letter={(name ?? 'Agent')[0].toUpperCase()} />
      {name ? <span data-no-translate>{name}</span> : <span>Agent</span>}
    </button>
  );
}
