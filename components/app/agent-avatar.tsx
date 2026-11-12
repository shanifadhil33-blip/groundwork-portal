'use client';
import { useAppWords } from './app-words';
/** The Agent's picture is a plain monogram: the first letter of its name. Never an animal, a robot or a sparkle. */
export function agentLetter(word: string) {
  // Arabic names start with the article ال; the letter after it is the one people see as the name's first.
  return [...word.trim().replace(/^ال(?=\p{L})/u, '')][0]?.toUpperCase() ?? 'A';
}
export function AgentAvatar({ name }: { name?: string | null; avatar?: string | null; size?: number }) {
  const words = useAppWords().words;
  // The letter is drawn by CSS from data-letter, so it never joins the name in the text.
  return <span className="agent-monogram" aria-hidden="true" data-letter={agentLetter(name?.trim() || words?.Agent || 'Agent')} />;
}
