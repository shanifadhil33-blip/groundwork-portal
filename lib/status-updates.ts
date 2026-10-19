// HOME06: the phrases from am onward (and the fil alias) were written by Codex and wait for native review (ledger LANG10).
// CMP05: the requester hears each step of their job in their own language. Fixed phrases, no AI call, no cost.
export type Step = 'scheduled' | 'in_progress' | 'done';
export type Message = Step | 'on_way';
const T: Record<string, Record<Message | 'photos', string>> = {
  en: { on_way: 'The technician is on the way. WO {n} {t}', photos: '{k} after photos are on the job.', scheduled: 'Your job is booked. WO {n} {t}', in_progress: 'The technician has started. WO {n} {t}', done: 'Your job is done. Please rate it. WO {n} {t}' },
  ar: { on_way: 'الفني في الطريق. WO {n} {t}', photos: 'توجد {k} صور بعد العمل في الطلب.', scheduled: 'تم حجز طلبك. WO {n} {t}', in_progress: 'بدأ الفني العمل. WO {n} {t}', done: 'تم إنجاز طلبك. يرجى تقييمه. WO {n} {t}' },
  hi: { on_way: 'तकनीशियन रास्ते में हैं। WO {n} {t}', photos: 'काम के बाद की {k} तस्वीरें काम के पेज पर हैं।', scheduled: 'आपका काम बुक हो गया है। WO {n} {t}', in_progress: 'तकनीशियन ने काम शुरू कर दिया है। WO {n} {t}', done: 'आपका काम पूरा हो गया। कृपया रेटिंग दें। WO {n} {t}' },
  ur: { on_way: 'ٹیکنیشن راستے میں ہے۔ WO {n} {t}', photos: 'کام کے بعد کی {k} تصاویر کام کے صفحے پر ہیں۔', scheduled: 'آپ کا کام بک ہو گیا ہے۔ WO {n} {t}', in_progress: 'ٹیکنیشن نے کام شروع کر دیا ہے۔ WO {n} {t}', done: 'آپ کا کام مکمل ہو گیا۔ براہ کرم ریٹنگ دیں۔ WO {n} {t}' },
  ml: { on_way: 'ടെക്നീഷ്യൻ വരുന്ന വഴിയിലാണ്. WO {n} {t}', photos: 'ജോലിക്ക് ശേഷമുള്ള {k} ഫോട്ടോകൾ ജോലിയുടെ പേജിലുണ്ട്.', scheduled: 'നിങ്ങളുടെ ജോലി ബുക്ക് ചെയ്തു. WO {n} {t}', in_progress: 'ടെക്നീഷ്യൻ ജോലി തുടങ്ങി. WO {n} {t}', done: 'നിങ്ങളുടെ ജോലി പൂർത്തിയായി. ദയവായി റേറ്റ് ചെയ്യുക. WO {n} {t}' },
  ta: { on_way: 'தொழில்நுட்ப வல்லுநர் வரும் வழியில் உள்ளார். WO {n} {t}', photos: 'வேலைக்குப் பிந்தைய {k} புகைப்படங்கள் வேலைப் பக்கத்தில் உள்ளன.', scheduled: 'உங்கள் வேலை பதிவு செய்யப்பட்டது. WO {n} {t}', in_progress: 'தொழில்நுட்ப வல்லுநர் வேலையை தொடங்கினார். WO {n} {t}', done: 'உங்கள் வேலை முடிந்தது. மதிப்பிடவும். WO {n} {t}' },
  fr: { on_way: 'Le technicien est en route. WO {n} {t}', photos: '{k} photos après travaux sont sur la fiche.', scheduled: 'Votre intervention est planifiée. WO {n} {t}', in_progress: 'Le technicien a commencé. WO {n} {t}', done: 'Votre intervention est terminée. Merci de la noter. WO {n} {t}' },
  ru: { on_way: 'Техник уже в пути. WO {n} {t}', photos: 'В заявке есть {k} фото после работы.', scheduled: 'Ваша заявка запланирована. WO {n} {t}', in_progress: 'Техник начал работу. WO {n} {t}', done: 'Работа выполнена. Пожалуйста, оцените её. WO {n} {t}' },
  tl: { on_way: 'Papunta na ang technician. WO {n} {t}', photos: 'May {k} larawan pagkatapos ng trabaho sa pahina ng trabaho.', scheduled: 'Naka book na ang iyong trabaho. WO {n} {t}', in_progress: 'Nagsimula na ang technician. WO {n} {t}', done: 'Tapos na ang iyong trabaho. Pakirate ito. WO {n} {t}' },
  bn: { on_way: 'টেকনিশিয়ান পথে আছেন। WO {n} {t}', photos: 'কাজের পরের {k}টি ছবি কাজের পাতায় আছে।', scheduled: 'আপনার কাজ বুক করা হয়েছে। WO {n} {t}', in_progress: 'টেকনিশিয়ান কাজ শুরু করেছেন। WO {n} {t}', done: 'আপনার কাজ শেষ হয়েছে। অনুগ্রহ করে রেটিং দিন। WO {n} {t}' },
  am: { on_way: 'ቴክኒሻኑ በመንገድ ላይ ነው። WO {n} {t}', photos: 'ከሥራ በኋላ የተነሱ {k} ፎቶዎች በሥራው ገጽ ላይ አሉ።', scheduled: 'ሥራዎ ተይዟል። WO {n} {t}', in_progress: 'ቴክኒሻኑ ሥራ ጀምሯል። WO {n} {t}', done: 'ሥራዎ ተጠናቋል። እባክዎ ደረጃ ይስጡ። WO {n} {t}' },
  'fa-ir': { on_way: 'تکنسین در راه است. WO {n} {t}', photos: '{k} عکس پس از کار در صفحه کار موجود است.', scheduled: 'کار شما رزرو شده است. WO {n} {t}', in_progress: 'تکنسین کار را شروع کرده است. WO {n} {t}', done: 'کار شما تمام شده است. لطفاً به آن امتیاز بدهید. WO {n} {t}' },
  'fa-af': { on_way: 'تخنیکر در راه است. WO {n} {t}', photos: '{k} عکس پس از کار در صفحه کار موجود است.', scheduled: 'کار شما ثبت شده است. WO {n} {t}', in_progress: 'تخنیکر کار را شروع کرده است. WO {n} {t}', done: 'کار شما تمام شده است. لطفاً به آن نمره بدهید. WO {n} {t}' },
  ha: { on_way: 'Mai gyara yana kan hanya. WO {n} {t}', photos: 'Hotuna {k} na bayan aiki suna shafin aikin.', scheduled: 'An shirya aikinku. WO {n} {t}', in_progress: 'Mai gyara ya fara aiki. WO {n} {t}', done: 'An gama aikinku. Don Allah ku ba shi maki. WO {n} {t}' },
  ig: { on_way: 'Onye ọrụ aka nọ nʼụzọ. WO {n} {t}', photos: 'Foto {k} e sere mgbe arụchara ọrụ dị na ibe ọrụ ahụ.', scheduled: 'E debanyela ọrụ gị. WO {n} {t}', in_progress: 'Onye ọrụ aka amalitela ọrụ. WO {n} {t}', done: 'A rụchaala ọrụ gị. Biko nye ya akara. WO {n} {t}' },
  lg: { on_way: 'Omukanika ali mu kkubo. WO {n} {t}', photos: 'Ebifaananyi {k} ebyatwaliddwa oluvannyuma lwʼomulimu biri ku lupapula lwʼomulimu.', scheduled: 'Omulimu gwo gutegekeddwa. WO {n} {t}', in_progress: 'Omukanika atandise okukola. WO {n} {t}', done: 'Omulimu gwo guwedde. Nsaba guwe obubonero. WO {n} {t}' },
  ne: { on_way: 'प्राविधिक बाटोमा हुनुहुन्छ। WO {n} {t}', photos: 'कामपछिका {k} तस्बिर कामको पृष्ठमा छन्।', scheduled: 'तपाईंको काम बुक भएको छ। WO {n} {t}', in_progress: 'प्राविधिकले काम सुरु गरेका छन्। WO {n} {t}', done: 'तपाईंको काम सकियो। कृपया मूल्याङ्कन गर्नुहोस्। WO {n} {t}' },
  ps: { on_way: 'تخنیکر په لاره دی. WO {n} {t}', photos: 'له کار وروسته {k} انځورونه د کار په پاڼه کې شته.', scheduled: 'ستاسو کار ثبت شوی دی. WO {n} {t}', in_progress: 'تخنیکر کار پیل کړی دی. WO {n} {t}', done: 'ستاسو کار بشپړ شو. مهرباني وکړئ نمرې ورکړئ. WO {n} {t}' },
  so: { on_way: 'Farsamayaqaanku jidka ayuu ku soo jiraa. WO {n} {t}', photos: '{k} sawir oo shaqada ka dib ah ayaa ku jira bogga shaqada.', scheduled: 'Shaqadaada waa la qorsheeyay. WO {n} {t}', in_progress: 'Farsamayaqaanku shaqada ayuu bilaabay. WO {n} {t}', done: 'Shaqadaadii waa dhammaatay. Fadlan qiimee. WO {n} {t}' },
  sw: { on_way: 'Fundi yuko njiani. WO {n} {t}', photos: 'Picha {k} za baada ya kazi ziko kwenye ukurasa wa kazi.', scheduled: 'Kazi yako imepangiwa muda. WO {n} {t}', in_progress: 'Fundi ameanza kazi. WO {n} {t}', done: 'Kazi yako imekamilika. Tafadhali ipe alama. WO {n} {t}' },
  ti: { on_way: 'ቴክኒሻን ኣብ መንገዲ ኣሎ። WO {n} {t}', photos: 'ድሕሪ ስራሕ ዝተሳእሉ {k} ስእልታት ኣብ ገጽ ስራሕ ኣለዉ።', scheduled: 'ስራሕኩም ተመዲቡ ኣሎ። WO {n} {t}', in_progress: 'ቴክኒሻን ስራሕ ጀሚሩ ኣሎ። WO {n} {t}', done: 'ስራሕኩም ተዛዚሙ ኣሎ። በጃኹም ነጥቢ ሃቡ። WO {n} {t}' },
  tw: { on_way: 'Ɔdwumayɛfo no nam kwan so reba. WO {n} {t}', photos: 'Adwuma no akyi mfonini {k} wɔ adwuma no krataafa no so.', scheduled: 'Yɛahyɛ wo adwuma no ho nhyehyɛe. WO {n} {t}', in_progress: 'Ɔdwumayɛfo no afi adwuma no ase. WO {n} {t}', done: 'Wo adwuma no awie. Yɛsrɛ wo, ma no nkontaa. WO {n} {t}' },
  yo: { on_way: 'Onímọ̀ ẹ̀rọ ń bọ̀ lọ́nà. WO {n} {t}', photos: 'Àwọn fọ́tò {k} lẹ́yìn iṣẹ́ wà ní ojú ìwé iṣẹ́ náà.', scheduled: 'A ti ṣètò iṣẹ́ rẹ. WO {n} {t}', in_progress: 'Onímọ̀ ẹ̀rọ ti bẹ̀rẹ̀ iṣẹ́. WO {n} {t}', done: 'Iṣẹ́ rẹ ti parí. Jọ̀wọ́, fún un ní àmì. WO {n} {t}' },
  zh: { on_way: '师傅正在赶来。 WO {n} {t}', photos: '维修页面上有{k}张完工照片。', scheduled: '您的维修已预约。 WO {n} {t}', in_progress: '师傅已开始工作。 WO {n} {t}', done: '您的维修已完成。请评分。 WO {n} {t}' },
};
T.fil = T.tl;
export const STATUS_LANGS = Object.keys(T);
const TITLE: Record<string, string> = { en: 'Job update', ar: 'تحديث الطلب', hi: 'काम की जानकारी', ur: 'کام کی تازہ کاری', ml: 'ജോലി അപ്ഡേറ്റ്', ta: 'வேலை புதுப்பிப்பு', fr: 'Suivi', ru: 'Обновление', tl: 'Update', bn: 'কাজের আপডেট',
  fil: 'Update', am: 'የሥራ መረጃ', 'fa-ir': 'وضعیت کار', 'fa-af': 'وضعیت کار',
  ha: 'Bayanin aiki', ig: 'Ozi ọrụ', lg: 'Ebifa ku mulimu', ne: 'कामको जानकारी',
  ps: 'د کار خبر', so: 'Warbixinta shaqada', sw: 'Taarifa ya kazi', ti: 'ሓበሬታ ስራሕ',
  tw: 'Adwuma ho nsɛm', yo: 'Ìròyìn iṣẹ́', zh: '维修进展',
};
export function statusLine(lang: string | null | undefined, step: Message, n: number | string, title: string, extra: { scheduledFor?: string | Date | null; timezone?: string; afterPhotos?: number } = {}) {
  const code = (lang ?? 'en').toLowerCase();
  const k = [code, code.split('-')[0]].find(key => Object.hasOwn(T, key)) ?? 'en';
  const lines = [T[k][step].replace('{n}', String(n)).replace('{t}', title)];
  if (step === 'scheduled' && extra.scheduledFor) {
    let locale = 'en';
    try { if (Intl.DateTimeFormat.supportedLocalesOf([code]).length) locale = code; } catch { /* Unknown locale uses English. */ }
    lines.push(new Intl.DateTimeFormat(locale, { timeZone: extra.timezone ?? 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(extra.scheduledFor)));
  }
  if (step === 'done' && (extra.afterPhotos ?? 0) > 0) lines.push(T[k].photos.replace('{k}', String(extra.afterPhotos)));
  return { title: TITLE[k], body: lines.join('\n'), lang: k };
}
export const isStep = (s: unknown): s is Step => s === 'scheduled' || s === 'in_progress' || s === 'done';
