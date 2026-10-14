// LEARN20: Agent avatars. Robots, animals and plain icons only, never human faces.
export const AVATARS = ['bot', 'cat', 'dog', 'bird', 'fish', 'rabbit', 'turtle', 'squirrel', 'leaf', 'wrench', 'sun'] as const;
export type Avatar = (typeof AVATARS)[number];
export const AVATAR_LABELS: Record<Avatar, string> = { bot: 'Robot', cat: 'Cat', dog: 'Dog', bird: 'Bird', fish: 'Fish', rabbit: 'Rabbit', turtle: 'Turtle', squirrel: 'Squirrel', leaf: 'Leaf', wrench: 'Wrench', sun: 'Sun' };
