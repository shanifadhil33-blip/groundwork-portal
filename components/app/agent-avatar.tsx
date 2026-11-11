'use client';
/** The Agent's picture is a plain monogram: the first letter of its name. Never an animal, a robot or a sparkle. */
export function AgentAvatar({ name }: { name?: string | null; avatar?: string | null; size?: number }) {
  // The letter is drawn by CSS from data-letter, so it never joins the name in the text.
  return <span className="agent-monogram" aria-hidden="true" data-letter={(name?.trim() || 'Agent')[0].toUpperCase()} />;
}
