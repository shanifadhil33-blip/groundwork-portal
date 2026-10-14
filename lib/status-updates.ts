// CMP05: the requester hears each step of their job in their own language. Fixed phrases, no AI call, no cost.
export type Step = 'scheduled' | 'in_progress' | 'done';
const T: Record<string, Record<Step, string>> = {
  en: { scheduled: 'Your job is booked. WO {n} {t}', in_progress: 'The technician has started. WO {n} {t}', done: 'Your job is done. Please rate it. WO {n} {t}' },
  ar: { scheduled: 'تم حجز طلبك. WO {n} {t}', in_progress: 'بدأ الفني العمل. WO {n} {t}', done: 'تم إنجاز طلبك. يرجى تقييمه. WO {n} {t}' },
  hi: { scheduled: 'आपका काम बुक हो गया है। WO {n} {t}', in_progress: 'तकनीशियन ने काम शुरू कर दिया है। WO {n} {t}', done: 'आपका काम पूरा हो गया। कृपया रेटिंग दें। WO {n} {t}' },
  ur: { scheduled: 'آپ کا کام بک ہو گیا ہے۔ WO {n} {t}', in_progress: 'ٹیکنیشن نے کام شروع کر دیا ہے۔ WO {n} {t}', done: 'آپ کا کام مکمل ہو گیا۔ براہ کرم ریٹنگ دیں۔ WO {n} {t}' },
  ml: { scheduled: 'നിങ്ങളുടെ ജോലി ബുക്ക് ചെയ്തു. WO {n} {t}', in_progress: 'ടെക്നീഷ്യൻ ജോലി തുടങ്ങി. WO {n} {t}', done: 'നിങ്ങളുടെ ജോലി പൂർത്തിയായി. ദയവായി റേറ്റ് ചെയ്യുക. WO {n} {t}' },
  ta: { scheduled: 'உங்கள் வேலை பதிவு செய்யப்பட்டது. WO {n} {t}', in_progress: 'தொழில்நுட்ப வல்லுநர் வேலையை தொடங்கினார். WO {n} {t}', done: 'உங்கள் வேலை முடிந்தது. மதிப்பிடவும். WO {n} {t}' },
  fr: { scheduled: 'Votre intervention est planifiée. WO {n} {t}', in_progress: 'Le technicien a commencé. WO {n} {t}', done: 'Votre intervention est terminée. Merci de la noter. WO {n} {t}' },
  ru: { scheduled: 'Ваша заявка запланирована. WO {n} {t}', in_progress: 'Техник начал работу. WO {n} {t}', done: 'Работа выполнена. Пожалуйста, оцените её. WO {n} {t}' },
  tl: { scheduled: 'Naka book na ang iyong trabaho. WO {n} {t}', in_progress: 'Nagsimula na ang technician. WO {n} {t}', done: 'Tapos na ang iyong trabaho. Pakirate ito. WO {n} {t}' },
  bn: { scheduled: 'আপনার কাজ বুক করা হয়েছে। WO {n} {t}', in_progress: 'টেকনিশিয়ান কাজ শুরু করেছেন। WO {n} {t}', done: 'আপনার কাজ শেষ হয়েছে। অনুগ্রহ করে রেটিং দিন। WO {n} {t}' },
};
const TITLE: Record<string, string> = { en: 'Job update', ar: 'تحديث الطلب', hi: 'काम की जानकारी', ur: 'کام کی تازہ کاری', ml: 'ജോലി അപ്ഡേറ്റ്', ta: 'வேலை புதுப்பிப்பு', fr: 'Suivi', ru: 'Обновление', tl: 'Update', bn: 'কাজের আপডেট' };
export function statusLine(lang: string | null | undefined, step: Step, n: number | string, title: string) {
  const k = (lang ?? 'en').toLowerCase().split('-')[0]; const t = T[k] ?? T.en;
  return { title: TITLE[k] ?? TITLE.en, body: t[step].replace('{n}', String(n)).replace('{t}', title), lang: T[k] ? k : 'en' };
}
export const isStep = (s: unknown): s is Step => s === 'scheduled' || s === 'in_progress' || s === 'done';
