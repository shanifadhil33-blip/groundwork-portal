/** Native read cues. Keep these separate from translated UI sentences: people rarely type a tap label verbatim.
 * Columns: overdue/follow up, attention/today, week summary, technician workload. */
export const operationalPhrases:Record<string,[string[],string[],string[],string[]]>={
 en:[['overdue','late jobs','late work orders','chase first','follow up first'],['attention today','do today','today\'s priorities','needs attention'],['this week','weekly summary','week summary'],['most open jobs','workload','jobs per technician','busiest technician','most jobs']],
 'ar-AE':[['متاخر','متاخرة','اتابع اول','نتابع اول','تجاوزت موعدها'],['اليوم','يحتاج انتباه','يحتاج متابعة'],['هالاسبوع','هذا الاسبوع','الاسبوع الحالي','ملخص اسبوعي','لخص الاسبوع','ملخص الاسبوع'],['اكثر شغل','اكثر اعمال','اكثر اوامر','ضغط العمل','عبء العمل','توزيع الشغل','شغل مفتوح','اعمال مفتوحة','الاعمال المفتوحة','الاوامر المفتوحة']],
 hi:[['देरी','अतिदेय','देर से','पीछा','फॉलो अप'],['आज','ध्यान चाहिए'],['इस हफ्ते','इस सप्ताह','साप्ताहिक सारांश'],['सबसे ज्यादा काम','सबसे अधिक खुले','काम का बोझ','प्रति तकनीशियन']],
 ur:[['تاخیر','دیر سے','فالو اپ'],['آج','توجہ چاہیے'],['اس ہفتے','ہفتہ وار خلاصہ'],['سب سے زیادہ کام','سب سے زیادہ کھلے','کام کا بوجھ','فی ٹیکنیشن']],
 ne:[['ढिलो','म्याद नाघ','पछ्याउने'],['आज','ध्यान चाहिन्छ'],['यो हप्ता','यस हप्ता','साप्ताहिक सारांश'],['सबैभन्दा धेरै काम','खुला काम','कामको भार']],
 bn:[['বিলম্ব','দেরি','মেয়াদ পেরিয়ে'],['আজ','মনোযোগ দরকার'],['এই সপ্তাহ','সাপ্তাহিক সারাংশ'],['সবচেয়ে বেশি কাজ','খোলা কাজ','কাজের চাপ']],
 ml:[['വൈകിയ','കാലാവധി കഴിഞ്ഞ','പിന്തുടര'],['ഇന്ന്','ശ്രദ്ധ വേണം'],['ഈ ആഴ്ച','പ്രതിവാര സംഗ്രഹം'],['ഏറ്റവും കൂടുതൽ ജോലി','തുറന്ന ജോലികൾ','ജോലിഭാരം']],
 ta:[['தாமத','காலக்கெடு கடந்த','பின்தொடர'],['இன்று','கவனம் தேவை'],['இந்த வார','வாராந்திர சுருக்கம்'],['அதிக வேலை','திறந்த வேலை','பணிச்சுமை']],
 ps:[['ځنډ','ناوخته','تعقیب'],['نن','پاملرنه'],['دا اونۍ','دې اونۍ','اونیز لنډیز'],['ډېر کار','خلاص کار','کاري بار']],
 'fa-AF':[['عقب افتاده','دیر شده','پیگیری'],['امروز','توجه لازم'],['این هفته','خلاصه هفتگی'],['بیشترین کار','کار باز','بار کاری']],
 'fa-IR':[['عقب افتاده','دیر شده','پیگیری'],['امروز','توجه لازم'],['این هفته','خلاصه هفتگی'],['بیشترین کار','کار باز','بار کاری']],
 fil:[['nahuli','lampas sa takdang','unahin habulin'],['ngayon','kailangan ng pansin'],['linggong ito','buod ng linggo'],['pinakamaraming trabaho','bukas na trabaho','dami ng trabaho']],
 'zh-CN':[['逾期','超期','催办'],['今天','需要关注'],['本周','这周','每周总结'],['未完成工作最多','工作量','每位技术员']],
 'sw-KE':[['zilizochelewa','zimechelewa','kufuatilia kwanza'],['leo','zinahitaji umakini'],['wiki hii','muhtasari wa wiki'],['kazi nyingi','kazi zilizo wazi','mzigo wa kazi']],
 am:[['የዘገዩ','ጊዜያቸው ያለፈ','መከታተል'],['ዛሬ','ትኩረት'],['በዚህ ሳምንት','የሳምንቱ ማጠቃለያ'],['ብዙ ሥራ','ክፍት ሥራ','የሥራ ጫና']],
 ti:[['ዝደንጎዩ','ግዜኦም ዝሓለፈ','ምክትታል'],['ሎሚ','ትኩረት'],['እዚ ሰሙን','ናይ ሰሙን ጽማቕ'],['ብዙሕ ስራሕ','ክፉት ስራሕ','ጾር ስራሕ']],
 so:[['dib u dhacay','daahay','dabagal'],['maanta','fiiro gaar'],['usbuucan','toddobaadkan','warbixinta toddobaadka'],['shaqooyinka ugu badan','shaqooyinka furan','culayska shaqada']],
 yo:[['ó ti pẹ́','ti pẹ','lépa'],['lónìí','akiyesi'],['ọsẹ yii','ọ̀sẹ̀ yìí','akopọ ọsẹ'],['iṣẹ to pọ','iṣẹ ṣiṣi','ẹrù iṣẹ']],
 ha:[['sun makara','jinkiri','bi diddigi'],['yau','kulawa'],['wannan makon','taƙaitaccen mako'],['aiki mafi yawa','ayyukan buɗe','nauyin aiki']],
 ig:[['egbu oge','gafere oge','soro ụzọ'],['taa','nlebara anya'],['izu a','nchịkọta izu'],['ọrụ kacha','ọrụ mepere','ibu ọrụ']],
 lg:[['ezikeere','ezayitako','okugoberera'],['leero','okufaayo'],['wiiki eno','mu bufunze wiiki'],['emirimu emingi','emirimu emiggule','obuzito bw emirimu']],
 tw:[['aka akyi','atwentwɛn','di akyi'],['nnɛ','ahwɛyiye'],['dapɛn yi','dapɛn no mu nsɛm'],['nnwuma pii','nnwuma a ɛda hɔ','adwuma so adesoa']],
};
export const normalizeOperational=(q:string)=>q.normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[’]/g,"'").replace(/[?.!؟।。]+$/u,'').replace(/\s+/g,' ').trim();
export function workloadQuestion(question:string){
 const q=normalizeOperational(question);
 return Object.values(operationalPhrases).some(cues=>cues[3].some(cue=>q.includes(normalizeOperational(cue))));
}
export function nativeOperationalIntent(question:string){
 const q=normalizeOperational(question);
 // Mutations and explicit scopes must be handled by tools, never by workspace-wide fixed answers.
 if(/\b(?:assign|send|cancel|delete|remove|change|create|book|move|mark|approve|reschedule|except|excluding|only|for (?!my team|the team))\b|(?:عين|اسند|ارسل|احذف|الغ|غير\s+(?:حالة|موعد|الفني|الاسناد)|انقل|فقط|في موقع|في مارينا|لفني)|(?:भेज|सौंप|बदल|हटाओ)|(?:بھیج|تفویض|تبدیل)|(?:পাঠাও|বরাদ্দ)|(?:அனுப்பு|ஒதுக்கு)|(?:അയയ്ക്ക|നിയമിക്ക)|(?:发送|分配|取消|仅)|(?:पठा|मेटा|हटाउ)|(?:അയക്ക|മാറ്റുക)|(?:நீக்கு|மாற்று)|(?:واستوه|ولیکه)|(?:بفرست|حذف|تغییر)|(?:ላክ|ሰርዝ)|(?:ስደድ|ደምስስ)|\b(?:badilisha|weka|dir|tirtir|padala|baguhin|kirim|goge|zipu|hichapụ|sindika|kyusa|soma)\b|\b(?:send|ipadala|tuma|futa)\b/iu.test(q))return null;
 // Named/numeric job requests need their own scoped reads.
 const scoped=q.replace(/[2٢۲]\s*(?:sentences?|جمل(?:ة|تين)|वाक्य(?:ों)?|جمل(?:ے|وں)|বাক্যে|वाक्यमा|വാക്യങ്ങളിൽ|வாக்கியங்களில்|句)/gu,'');
 if(/[\d\u0660-\u0669\u06F0-\u06F9]/.test(scoped))return null;
 if(/\b(?:overdue|jobs|work orders|workload)\b/i.test(q)&&/\bat\s+\p{L}/iu.test(q))return null;
 if(/\b(?:weather|temperature|date today|time today|payment|invoice|price|revenue)\b|(?:تاريخ اليوم|الطقس|الحرارة)/iu.test(q))return null;
 const kinds=['overdue','attention','week','workload'] as const;
 // Workload has precedence over today/week when the user asks about a technician's current load.
 for(const i of [3,0,2,1])for(const cues of Object.values(operationalPhrases))if(cues[i].some(cue=>q.includes(normalizeOperational(cue))))return kinds[i];
 return null;
}
