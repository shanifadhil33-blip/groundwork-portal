'use client';
import { joinNames } from '../../lib/ui/name-joins';
import { useNotificationLanguage } from './notification-language';

export function useNameJoin() {
  const { words } = useNotificationLanguage();
  return (values: (string | null | undefined)[]) => joinNames(values, words ?? {});
}
