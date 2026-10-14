'use client';
import { Bird, Bot, Cat, Dog, Fish, Leaf, Rabbit, Squirrel, Sun, Turtle, Wrench } from 'lucide-react';
import type { Avatar } from '../../lib/avatars';
const ICONS = { bot: Bot, cat: Cat, dog: Dog, bird: Bird, fish: Fish, rabbit: Rabbit, turtle: Turtle, squirrel: Squirrel, leaf: Leaf, wrench: Wrench, sun: Sun } as const;
export function AgentAvatar({ avatar, size = 20 }: { avatar?: string | null; size?: number }) {
  const Icon = ICONS[(avatar ?? 'bot') as Avatar] ?? Bot;
  return <span className="agent-avatar" aria-hidden="true"><Icon size={size} /></span>;
}
