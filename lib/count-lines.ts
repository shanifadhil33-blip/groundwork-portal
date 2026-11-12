// AGENT12 count answers in every app language. Fixed words, no AI call. Arabic written by hand with its number rules;
// the other non English lines wait for native review (ledger LANG10), like lib/status-updates.ts.
export type CountLine = 'other' | 'self' | 'client' | 'own_only' | 'not_found' | 'ambiguous';
type Lines = Record<CountLine, string>;
// {name} person, {m} this month, {t} in total, {names} list of full names.
const T: Record<string, Lines> = {
  en: { other: '{name} finished {mj} this month and {t} in total.', self: 'You finished {mj} this month and {t} in total.', client: 'Job counts are only for the company team. I can show your own requests instead.', own_only: 'You can see your own count.', not_found: 'I could not find that person on your team.', ambiguous: 'Which person do you mean? {names}.' },
  hi: { other: '{name} ने इस महीने {m} काम पूरे किए और कुल {t}।', self: 'आपने इस महीने {m} काम पूरे किए और कुल {t}।', client: 'काम की गिनती सिर्फ कंपनी की टीम के लिए है। मैं आपके अपने अनुरोध दिखा सकता हूँ।', own_only: 'आप सिर्फ अपनी गिनती देख सकते हैं।', not_found: 'मुझे आपकी टीम में यह व्यक्ति नहीं मिला।', ambiguous: 'आप किसकी बात कर रहे हैं? {names}।' },
  ur: { other: '{name} نے اس مہینے {m} کام مکمل کیے اور کل {t}۔', self: 'آپ نے اس مہینے {m} کام مکمل کیے اور کل {t}۔', client: 'کام کی گنتی صرف کمپنی کی ٹیم کے لیے ہے۔ میں آپ کی اپنی درخواستیں دکھا سکتا ہوں۔', own_only: 'آپ صرف اپنی گنتی دیکھ سکتے ہیں۔', not_found: 'مجھے آپ کی ٹیم میں یہ شخص نہیں ملا۔', ambiguous: 'آپ کس کی بات کر رہے ہیں؟ {names}۔' },
  ml: { other: '{name} ഈ മാസം {m} ജോലികൾ പൂർത്തിയാക്കി, ആകെ {t}.', self: 'നിങ്ങൾ ഈ മാസം {m} ജോലികൾ പൂർത്തിയാക്കി, ആകെ {t}.', client: 'ജോലികളുടെ എണ്ണം കമ്പനി ടീമിന് മാത്രമാണ്. നിങ്ങളുടെ സ്വന്തം അഭ്യർത്ഥനകൾ കാണിക്കാം.', own_only: 'നിങ്ങൾക്ക് സ്വന്തം എണ്ണം മാത്രം കാണാം.', not_found: 'ആ വ്യക്തിയെ നിങ്ങളുടെ ടീമിൽ കണ്ടില്ല.', ambiguous: 'ആരെയാണ് ഉദ്ദേശിക്കുന്നത്? {names}.' },
  ta: { other: '{name} இந்த மாதம் {m} வேலைகளை முடித்தார், மொத்தம் {t}.', self: 'நீங்கள் இந்த மாதம் {m} வேலைகளை முடித்தீர்கள், மொத்தம் {t}.', client: 'வேலை எண்ணிக்கை நிறுவன குழுவுக்கு மட்டும். உங்கள் சொந்த கோரிக்கைகளைக் காட்டலாம்.', own_only: 'உங்கள் சொந்த எண்ணிக்கையை மட்டும் பார்க்கலாம்.', not_found: 'அந்த நபர் உங்கள் குழுவில் இல்லை.', ambiguous: 'யாரைச் சொல்கிறீர்கள்? {names}.' },
  bn: { other: '{name} এই মাসে {m}টি কাজ শেষ করেছেন, মোট {t}টি।', self: 'আপনি এই মাসে {m}টি কাজ শেষ করেছেন, মোট {t}টি।', client: 'কাজের সংখ্যা শুধু কোম্পানির দলের জন্য। আমি আপনার নিজের অনুরোধগুলো দেখাতে পারি।', own_only: 'আপনি শুধু নিজের সংখ্যা দেখতে পারেন।', not_found: 'আপনার দলে এই ব্যক্তিকে পাইনি।', ambiguous: 'আপনি কার কথা বলছেন? {names}।' },
  ne: { other: '{name} ले यो महिना {m} काम पूरा गर्नुभयो, जम्मा {t}।', self: 'तपाईंले यो महिना {m} काम पूरा गर्नुभयो, जम्मा {t}।', client: 'कामको गन्ती कम्पनीको टोलीका लागि मात्र हो। म तपाईंका आफ्नै अनुरोध देखाउन सक्छु।', own_only: 'तपाईं आफ्नो गन्ती मात्र हेर्न सक्नुहुन्छ।', not_found: 'तपाईंको टोलीमा त्यो व्यक्ति भेटिएन।', ambiguous: 'तपाईं कसको कुरा गर्दै हुनुहुन्छ? {names}।' },
  ps: { other: '{name} دا میاشت {m} کارونه بشپړ کړل، ټول {t}.', self: 'تاسو دا میاشت {m} کارونه بشپړ کړل، ټول {t}.', client: 'د کارونو شمېر یوازې د شرکت ټیم لپاره دی. زه ستاسو خپلې غوښتنې ښودلی شم.', own_only: 'تاسو یوازې خپل شمېر لیدلی شئ.', not_found: 'دا کس مې ستاسو په ټیم کې ونه موند.', ambiguous: 'د چا خبره کوئ؟ {names}.' },
  fa: { other: '{name} این ماه {m} کار را تمام کرد و در مجموع {t}.', self: 'شما این ماه {m} کار را تمام کردید و در مجموع {t}.', client: 'شمار کارها فقط برای تیم شرکت است. می‌توانم درخواست‌های خودتان را نشان دهم.', own_only: 'شما فقط شمار کارهای خودتان را می‌بینید.', not_found: 'این شخص را در تیم شما پیدا نکردم.', ambiguous: 'منظورتان کیست؟ {names}.' },
  fil: { other: 'Natapos ni {name} ang {m} na trabaho ngayong buwan at {t} sa kabuuan.', self: 'Natapos mo ang {m} na trabaho ngayong buwan at {t} sa kabuuan.', client: 'Ang bilang ng trabaho ay para lang sa team ng kumpanya. Maipapakita ko ang sarili mong mga request.', own_only: 'Sarili mong bilang lang ang makikita mo.', not_found: 'Hindi ko nakita ang taong iyon sa team mo.', ambiguous: 'Sino ang ibig mong sabihin? {names}.' },
  zh: { other: '{name} 本月完成了 {m} 项工作，总共 {t} 项。', self: '你本月完成了 {m} 项工作，总共 {t} 项。', client: '工作数量只供公司团队查看。我可以给你看你自己的请求。', own_only: '你只能查看自己的数量。', not_found: '我在你的团队中没有找到这个人。', ambiguous: '你指的是谁？{names}。' },
  sw: { other: '{name} amemaliza kazi {m} mwezi huu na {t} kwa jumla.', self: 'Umemaliza kazi {m} mwezi huu na {t} kwa jumla.', client: 'Idadi ya kazi ni kwa timu ya kampuni tu. Ninaweza kukuonyesha maombi yako mwenyewe.', own_only: 'Unaweza kuona idadi yako tu.', not_found: 'Sikumpata mtu huyo kwenye timu yako.', ambiguous: 'Unamaanisha nani? {names}.' },
  am: { other: '{name} በዚህ ወር {m} ስራዎችን ጨርሷል፣ በአጠቃላይ {t}።', self: 'በዚህ ወር {m} ስራዎችን ጨርሰዋል፣ በአጠቃላይ {t}።', client: 'የስራ ብዛት ለኩባንያው ቡድን ብቻ ነው። የራስዎን ጥያቄዎች ላሳይዎት እችላለሁ።', own_only: 'የራስዎን ብዛት ብቻ ማየት ይችላሉ።', not_found: 'ያንን ሰው በቡድንዎ ውስጥ አላገኘሁትም።', ambiguous: 'ማንን ማለትዎ ነው? {names}።' },
  ti: { other: '{name} ኣብዚ ወርሒ {m} ስራሕቲ ወዲኡ፣ ብድምር {t}።', self: 'ኣብዚ ወርሒ {m} ስራሕቲ ወዲእኩም፣ ብድምር {t}።', client: 'ቁጽሪ ስራሕቲ ንጉጅለ ኩባንያ ጥራይ እዩ። ናይ ገዛእ ርእስኹም ሕቶታት ከርእየኩም እኽእል።', own_only: 'ናይ ገዛእ ርእስኹም ቁጽሪ ጥራይ ክትርእዩ ትኽእሉ።', not_found: 'ነቲ ሰብ ኣብ ጉጅለኹም ኣይረኸብክዎን።', ambiguous: 'መን ማለትኩም? {names}።' },
  so: { other: '{name} wuxuu dhammeeyay {m} shaqo bishan iyo {t} wadar ahaan.', self: 'Waxaad dhammeysay {m} shaqo bishan iyo {t} wadar ahaan.', client: 'Tirada shaqooyinka waxaa leh kooxda shirkadda oo keliya. Waxaan ku tusi karaa codsiyadaada.', own_only: 'Waxaad arki kartaa tiradaada oo keliya.', not_found: 'Qofkaas kooxdaada kuma helin.', ambiguous: 'Yaad ula jeeddaa? {names}.' },
  yo: { other: '{name} parí iṣẹ́ {m} ní oṣù yìí àti {t} lápapọ̀.', self: 'O parí iṣẹ́ {m} ní oṣù yìí àti {t} lápapọ̀.', client: 'Iye iṣẹ́ wà fún ẹgbẹ́ ilé iṣẹ́ nìkan. Mo lè fi àwọn ìbéèrè tìrẹ hàn ọ́.', own_only: 'Iye tìrẹ nìkan ni o lè rí.', not_found: 'Mi ò rí ẹni yẹn nínú ẹgbẹ́ rẹ.', ambiguous: 'Ta ni o ní lọ́kàn? {names}.' },
  ha: { other: '{name} ya kammala ayyuka {m} a wannan wata, jimilla {t}.', self: 'Ka kammala ayyuka {m} a wannan wata, jimilla {t}.', client: 'Adadin ayyuka na ƙungiyar kamfani ne kawai. Zan iya nuna maka buƙatunka.', own_only: 'Za ka iya ganin adadinka kawai.', not_found: 'Ban sami wannan mutumin a ƙungiyarka ba.', ambiguous: 'Wa kake nufi? {names}.' },
  ig: { other: '{name} mezuru ọrụ {m} n’ọnwa a, na {t} n’ozuzu.', self: 'Ị mezuru ọrụ {m} n’ọnwa a, na {t} n’ozuzu.', client: 'Ọnụ ọgụgụ ọrụ bụ maka ndị otu ụlọ ọrụ naanị. Enwere m ike igosi gị arịrịọ gị.', own_only: 'Ị nwere ike ịhụ naanị ọnụ ọgụgụ nke gị.', not_found: 'Ahụghị m onye ahụ n’otu gị.', ambiguous: 'Onye ka ị chọrọ ịsị? {names}.' },
  lg: { other: '{name} amaze emirimu {m} omwezi guno, gyonna awamu {t}.', self: 'Omaze emirimu {m} omwezi guno, gyonna awamu {t}.', client: 'Omuwendo gw’emirimu gwa ttiimu ya kkampuni yokka. Nsobola okukulaga okusaba kwo.', own_only: 'Osobola okulaba omuwendo gwo gwokka.', not_found: 'Omuntu oyo simuzudde mu ttiimu yo.', ambiguous: 'Otegeeza ani? {names}.' },
  tw: { other: '{name} awie nnwuma {m} bosome yi, ne nyinaa {t}.', self: 'Woawie nnwuma {m} bosome yi, ne nyinaa {t}.', client: 'Nnwuma dodow no wɔ hɔ ma adwumakuw no nko. Metumi akyerɛ wo w’ankasa abisade.', own_only: 'Wo ankasa wo dodow nko na wubetumi ahu.', not_found: 'Manhu saa nipa no wɔ wo kuw mu.', ambiguous: 'Hwan na woreka ne ho asɛm? {names}.' },
};
/** Gulf Arabic by hand: one, two, three to ten, eleven to ninety nine, and hundreds follow the Arabic counted noun rules. */
export function arabicJobs(n: number): string {
  if (n === 1) return 'عملًا واحدًا';
  if (n === 2) return 'عملين';
  const r = n % 100;
  if (n >= 3 && r >= 3 && r <= 10) return `${n} أعمال`;
  if (r >= 11) return `${n} عملًا`;
  return `${n} عمل`;
}
function arabic(kind: CountLine, v: { name?: string; month: number; total: number; names?: string }): string {
  switch (kind) {
    case 'other': return v.month === 0 ? `لم ينجز ${v.name} أي عمل هذا الشهر، ومجموع أعماله ${v.total}.` : `أنجز ${v.name} ${arabicJobs(v.month)} هذا الشهر، ومجموع أعماله ${v.total}.`;
    case 'self': return v.month === 0 ? `لم تنجز أي عمل هذا الشهر، ومجموع أعمالك ${v.total}.` : `أنجزت ${arabicJobs(v.month)} هذا الشهر، ومجموع أعمالك ${v.total}.`;
    case 'client': return 'عدد الأعمال لفريق الشركة فقط. أقدر أعرض لك طلباتك.';
    case 'own_only': return 'تقدر تشوف عدد أعمالك فقط.';
    case 'not_found': return 'ما لقيت هذا الشخص في فريقك.';
    case 'ambiguous': return `أي شخص تقصد؟ ${v.names}.`;
  }
}
const base = (lang?: string | null) => { const l = (lang ?? 'en').toLowerCase(); return l.startsWith('ar') ? 'ar' : l.startsWith('fa') ? 'fa' : l.startsWith('zh') ? 'zh' : l.startsWith('sw') ? 'sw' : l.split('-')[0]; };
export const COUNT_LANGS = ['ar', ...Object.keys(T)];
/** True when the line is already in the reader's language, so the page translation must leave it alone. */
export const countLocalized = (lang?: string | null) => base(lang) !== 'en' && COUNT_LANGS.includes(base(lang));
export function countLine(lang: string | null | undefined, kind: CountLine, v: { name?: string; month?: number; total?: number; names?: string } = {}): string {
  const b = base(lang), month = v.month ?? 0, total = v.total ?? 0;
  if (b === 'ar') return arabic(kind, { ...v, month, total });
  const lines = T[b] ?? T.en;
  return lines[kind].replace('{mj}', `${month} ${month === 1 ? 'job' : 'jobs'}`).replace('{m}', String(month)).replace('{t}', String(total)).replace('{name}', v.name ?? '').replace('{names}', v.names ?? '');
}

// Fixed personal progress summary. These translations await native review alongside the count lines above.
const FIXES: Record<string, string> = {
 en: '{mj} this month, {l} last month, {t} in total.',
 hi: 'इस महीने {m} काम, पिछले महीने {l}, कुल {t}।',
 ur: 'اس مہینے {m} کام، پچھلے مہینے {l}، کل {t}۔',
 ml: 'ഈ മാസം {m} ജോലികൾ, കഴിഞ്ഞ മാസം {l}, ആകെ {t}.',
 ta: 'இந்த மாதம் {m} வேலைகள், கடந்த மாதம் {l}, மொத்தம் {t}.',
 bn: 'এই মাসে {m} কাজ, গত মাসে {l}, মোট {t}।',
 ne: 'यो महिना {m} काम, गत महिना {l}, जम्मा {t}।',
 ps: 'دا میاشت {m} کارونه، تېره میاشت {l}، ټول {t}.',
 fa: 'این ماه {m} کار، ماه گذشته {l}، در مجموع {t}.',
 fil: '{m} trabaho ngayong buwan, {l} noong nakaraang buwan, {t} sa kabuuan.',
 zh: '本月 {m} 项工作，上月 {l} 项，共 {t} 项。',
 sw: 'Kazi {m} mwezi huu, {l} mwezi uliopita, {t} kwa jumla.',
 am: 'በዚህ ወር {m} ስራዎች፣ ባለፈው ወር {l}፣ በአጠቃላይ {t}።',
 ti: 'ኣብዚ ወርሒ {m} ስራሕቲ፣ ዝሓለፈ ወርሒ {l}፣ ብድምር {t}።',
 so: '{m} shaqo bishan, {l} bishii hore, {t} wadar ahaan.',
 yo: 'Iṣẹ́ {m} ní oṣù yìí, {l} ní oṣù tó kọjá, {t} lápapọ̀.',
 ha: 'Ayyuka {m} a wannan wata, {l} watan da ya gabata, jimilla {t}.',
 ig: 'Ọrụ {m} n’ọnwa a, {l} n’ọnwa gara aga, {t} n’ozuzu.',
 lg: 'Emirimu {m} omwezi guno, {l} omwezi oguwedde, {t} gyonna awamu.',
 tw: 'Nnwuma {m} bosome yi, {l} bosome a etwaam, ne nyinaa {t}.',
};
export function fixesLine(lang: string | null | undefined, v: { month: number; last_month: number; total: number }): string {
 if (base(lang) === 'ar') return `${arabicJobs(v.month)} هذا الشهر، و${arabicJobs(v.last_month)} الشهر الماضي، والمجموع ${arabicJobs(v.total)}.`;
 return (FIXES[base(lang)] ?? FIXES.en).replace('{mj}', `${v.month} ${v.month === 1 ? 'job' : 'jobs'}`).replace('{m}', String(v.month)).replace('{l}', String(v.last_month)).replace('{t}', String(v.total));
}
