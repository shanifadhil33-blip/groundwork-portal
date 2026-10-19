// HOME06: the phrases from am onward (and the fil alias) were written by Codex and wait for native review (ledger LANG10).
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
  am: { scheduled: 'ሥራዎ ተይዟል። WO {n} {t}', in_progress: 'ቴክኒሻኑ ሥራ ጀምሯል። WO {n} {t}', done: 'ሥራዎ ተጠናቋል። እባክዎ ደረጃ ይስጡ። WO {n} {t}' },
  'fa-ir': { scheduled: 'کار شما رزرو شده است. WO {n} {t}', in_progress: 'تکنسین کار را شروع کرده است. WO {n} {t}', done: 'کار شما تمام شده است. لطفاً به آن امتیاز بدهید. WO {n} {t}' },
  'fa-af': { scheduled: 'کار شما ثبت شده است. WO {n} {t}', in_progress: 'تخنیکر کار را شروع کرده است. WO {n} {t}', done: 'کار شما تمام شده است. لطفاً به آن نمره بدهید. WO {n} {t}' },
  ha: { scheduled: 'An shirya aikinku. WO {n} {t}', in_progress: 'Mai gyara ya fara aiki. WO {n} {t}', done: 'An gama aikinku. Don Allah ku ba shi maki. WO {n} {t}' },
  ig: { scheduled: 'E debanyela ọrụ gị. WO {n} {t}', in_progress: 'Onye ọrụ aka amalitela ọrụ. WO {n} {t}', done: 'A rụchaala ọrụ gị. Biko nye ya akara. WO {n} {t}' },
  lg: { scheduled: 'Omulimu gwo gutegekeddwa. WO {n} {t}', in_progress: 'Omukanika atandise okukola. WO {n} {t}', done: 'Omulimu gwo guwedde. Nsaba guwe obubonero. WO {n} {t}' },
  ne: { scheduled: 'तपाईंको काम बुक भएको छ। WO {n} {t}', in_progress: 'प्राविधिकले काम सुरु गरेका छन्। WO {n} {t}', done: 'तपाईंको काम सकियो। कृपया मूल्याङ्कन गर्नुहोस्। WO {n} {t}' },
  ps: { scheduled: 'ستاسو کار ثبت شوی دی. WO {n} {t}', in_progress: 'تخنیکر کار پیل کړی دی. WO {n} {t}', done: 'ستاسو کار بشپړ شو. مهرباني وکړئ نمرې ورکړئ. WO {n} {t}' },
  so: { scheduled: 'Shaqadaada waa la qorsheeyay. WO {n} {t}', in_progress: 'Farsamayaqaanku shaqada ayuu bilaabay. WO {n} {t}', done: 'Shaqadaadii waa dhammaatay. Fadlan qiimee. WO {n} {t}' },
  sw: { scheduled: 'Kazi yako imepangiwa muda. WO {n} {t}', in_progress: 'Fundi ameanza kazi. WO {n} {t}', done: 'Kazi yako imekamilika. Tafadhali ipe alama. WO {n} {t}' },
  ti: { scheduled: 'ስራሕኩም ተመዲቡ ኣሎ። WO {n} {t}', in_progress: 'ቴክኒሻን ስራሕ ጀሚሩ ኣሎ። WO {n} {t}', done: 'ስራሕኩም ተዛዚሙ ኣሎ። በጃኹም ነጥቢ ሃቡ። WO {n} {t}' },
  tw: { scheduled: 'Yɛahyɛ wo adwuma no ho nhyehyɛe. WO {n} {t}', in_progress: 'Ɔdwumayɛfo no afi adwuma no ase. WO {n} {t}', done: 'Wo adwuma no awie. Yɛsrɛ wo, ma no nkontaa. WO {n} {t}' },
  yo: { scheduled: 'A ti ṣètò iṣẹ́ rẹ. WO {n} {t}', in_progress: 'Onímọ̀ ẹ̀rọ ti bẹ̀rẹ̀ iṣẹ́. WO {n} {t}', done: 'Iṣẹ́ rẹ ti parí. Jọ̀wọ́, fún un ní àmì. WO {n} {t}' },
  zh: { scheduled: '您的维修已预约。 WO {n} {t}', in_progress: '师傅已开始工作。 WO {n} {t}', done: '您的维修已完成。请评分。 WO {n} {t}' },
};
T.fil = T.tl;
export const STATUS_LANGS = Object.keys(T);
const TITLE: Record<string, string> = { en: 'Job update', ar: 'تحديث الطلب', hi: 'काम की जानकारी', ur: 'کام کی تازہ کاری', ml: 'ജോലി അപ്ഡേറ്റ്', ta: 'வேலை புதுப்பிப்பு', fr: 'Suivi', ru: 'Обновление', tl: 'Update', bn: 'কাজের আপডেট',
  fil: 'Update', am: 'የሥራ መረጃ', 'fa-ir': 'وضعیت کار', 'fa-af': 'وضعیت کار',
  ha: 'Bayanin aiki', ig: 'Ozi ọrụ', lg: 'Ebifa ku mulimu', ne: 'कामको जानकारी',
  ps: 'د کار خبر', so: 'Warbixinta shaqada', sw: 'Taarifa ya kazi', ti: 'ሓበሬታ ስራሕ',
  tw: 'Adwuma ho nsɛm', yo: 'Ìròyìn iṣẹ́', zh: '维修进展',
};
export function statusLine(lang: string | null | undefined, step: Step, n: number | string, title: string) {
  const code = (lang ?? 'en').toLowerCase();
  const k = [code, code.split('-')[0]].find(key => Object.hasOwn(T, key)) ?? 'en';
  return { title: TITLE[k], body: T[k][step].replace('{n}', String(n)).replace('{t}', title), lang: k };
}
export const isStep = (s: unknown): s is Step => s === 'scheduled' || s === 'in_progress' || s === 'done';
