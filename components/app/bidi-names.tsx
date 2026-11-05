'use client';
import { Fragment, type ReactNode } from 'react';
import { NAME_JOIN } from '../../lib/ui/name-joins';
import { useAppWords } from './app-words';
import { useNotificationLanguage } from './notification-language';

/** Keep locale punctuation outside each independently directed name. */
export function BidiNames({ values }: { values: (string | null | undefined)[] }) {
  const initial = useAppWords(), published = useNotificationLanguage();
  const words = initial.language ? initial.words : published.words;
  return values.filter((value): value is string => !!value).reduce<ReactNode>((first, value, i) => {
    const second = <bdi data-no-translate>{value}</bdi>;
    if (i === 0) return second;
    return (words?.[NAME_JOIN] ?? NAME_JOIN).split(/(\{first\}|\{second\})/g).map((part, n) =>
      <Fragment key={n}>{part === '{first}' ? first : part === '{second}' ? second : part}</Fragment>);
  }, null);
}
