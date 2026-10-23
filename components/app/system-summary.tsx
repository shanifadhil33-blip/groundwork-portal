'use client';
import { useNotificationLanguage } from './notification-language';
import { NotificationMessage } from './notification-message';
import { isEnglish } from '../../lib/i18n';
import { agentSummaryTemplate } from '../../lib/ui/audit-summary';
import type { NotificationTemplate } from '../../lib/ui/notifications';

export function SystemSummary({messages, fallback = ''}: {messages?: NotificationTemplate[] | null; fallback?: string}) {
  const {language, words} = useNotificationLanguage();
  const legacy = agentSummaryTemplate(fallback);
  const templates = messages ?? (legacy ? [legacy] : null);
  if (!templates) return <span data-no-translate>{fallback}</span>;
  if (!words && !isEnglish(language)) return <span aria-busy="true">…</span>;
  const dictionary = words ?? {};
  return <>{templates.map((message, index) => <span key={index}>{index > 0 && ' · '}<NotificationMessage message={message} words={dictionary} language={language || 'en-IN'}/></span>)}</>;
}
