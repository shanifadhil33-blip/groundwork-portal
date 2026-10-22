import { expect, it } from 'vitest';
import { operationalIntent } from '../lib/agent/operational-answers';
import { LANGUAGES } from '../lib/languages';
// Independent full user questions, rather than deriving expected matches from the routing lexicon.
const questions:Record<string,string[]>={
 en:['Which jobs are late and who do I chase first?','What needs my attention today?','Give the team a summary of this week','Who has the most open jobs and why might that be?'],
 'ar-AE':['أي أوامر عمل متأخرة ومين أتابع أول؟','وش أهم شي عندنا اليوم؟','لخص لي هالأسبوع للفريق بجملتين.','مين عنده أكثر شغل مفتوح؟'],
 hi:['कौन से काम देरी से चल रहे हैं और पहले किससे पूछूँ?','आज सबसे पहले क्या करना है?','इस हफ्ते टीम ने क्या किया, संक्षेप में बताओ','किस तकनीशियन के पास सबसे ज्यादा काम है?'],
 ur:['کون سے کام تاخیر کا شکار ہیں اور پہلے کس سے پوچھوں؟','آج کس کام پر توجہ دوں؟','اس ہفتے کی ٹیم کی کارکردگی بتائیں','کس ٹیکنیشن پر کام کا بوجھ سب سے زیادہ ہے؟'],
 ne:['कुन काम ढिलो भएको छ र कसलाई पहिले सोध्ने?','आज पहिले के गर्ने?','यो हप्ता टोलीको सारांश दिनुहोस्','कुन प्राविधिकसँग सबैभन्दा धेरै काम छ?'],
 bn:['কোন কাজ দেরি হচ্ছে এবং কাকে আগে জিজ্ঞাসা করব?','আজ কোন কাজ আগে করব?','এই সপ্তাহের দলের সারাংশ বলুন','কোন প্রযুক্তিবিদের সবচেয়ে বেশি কাজ আছে?'],
 ml:['വൈകിയ ജോലികൾ ഏതൊക്കെ, ആരെ ആദ്യം ബന്ധപ്പെടണം?','ഇന്ന് ആദ്യം എന്തു ചെയ്യണം?','ഈ ആഴ്ച ടീമിന്റെ സംഗ്രഹം തരൂ','ഏറ്റവും കൂടുതൽ ജോലി ഏത് ടെക്നീഷ്യനാണ്?'],
 ta:['தாமதமான வேலைகள் எவை, முதலில் யாரிடம் கேட்க வேண்டும்?','இன்று முதலில் என்ன செய்ய வேண்டும்?','இந்த வார அணியின் சுருக்கம் சொல்லுங்கள்','எந்த தொழில்நுட்ப நிபுணருக்கு அதிக வேலை உள்ளது?'],
 ps:['کوم کارونه ناوخته دي او لومړی څوک وپوښتم؟','نن لومړی څه وکړم؟','دا اونۍ د ټیم لنډیز راکړئ','کوم تخنیکر ډېر کار لري؟'],
 'fa-AF':['کدام کارها عقب افتاده و اول از چه کسی پیگیری کنم؟','امروز اول چه کاری کنم؟','این هفته تیم را خلاصه کن','کدام تخنیکر بیشترین کار را دارد؟'],
 'fa-IR':['کدام کارها دیر شده و اول از چه کسی پیگیری کنم؟','امروز چه چیزی مهم است؟','خلاصه هفتگی تیم را بگو','کدام تکنسین بیشترین کار را دارد؟'],
 fil:['Aling mga trabaho ang nahuli at sino ang unahin?','Ano ang dapat kong unahin ngayon?','Ibuod ang linggong ito para sa team','Sino ang may pinakamaraming trabaho?'],
 'zh-CN':['哪些工单逾期了，应该先催谁？','今天哪些事情需要关注？','用两句话总结本周团队工作','哪位技术员的工作量最大？'],
 'sw-KE':['Ni kazi gani zimechelewa na nimfuatilie nani kwanza?','Nifanye nini kwanza leo?','Fupisha wiki hii kwa timu','Ni fundi gani ana kazi nyingi zaidi?'],
 am:['የዘገዩ ሥራዎች የትኞቹ ናቸው?','ዛሬ መጀመሪያ ምን ላድርግ?','በዚህ ሳምንት የቡድኑን ሥራ አጠቃልል','ብዙ ሥራ ያለው ቴክኒሻን ማነው?'],
 ti:['ዝደንጎዩ ስራሓት ኣየኖት እዮም?','ሎሚ ቀዳማይ እንታይ ክገብር?','እዚ ሰሙን ናይ ጉጅለ ስራሕ ጽማቕ ሃበኒ','ብዙሕ ስራሕ ዘለዎ ቴክኒሻን መን እዩ?'],
 so:['Shaqooyinkee dib u dhacay yaanse marka hore la xiriiraa?','Maxaan maanta marka hore qabtaa?','Soo koob shaqada kooxda usbuucan','Farsamayaqaan kee haya shaqooyinka ugu badan?'],
 yo:['Àwọn iṣẹ wo ló ti pẹ́, ta ni kí n lépa kọ́kọ́?','Kí ni kí n ṣe lónìí?','Ṣe akopọ iṣẹ ẹgbẹ fun ọsẹ yii','Ta ni o ni iṣẹ to pọ julọ?'],
 ha:['Wadanne ayyuka sun makara kuma wa zan fara bi?','Me zan fara yi yau?','Taƙaita aikin ƙungiyar wannan makon','Wane mai fasaha yake da aiki mafi yawa?'],
 ig:['Kedu ọrụ ndị egbu oge na onye ka m ga-ebu ụzọ jụọ?','Gịnị ka m ga-eme taa?','Kọwaa ọrụ otu n’izu a','Kedu onye ọrụ nwere ọrụ kacha ukwuu?'],
 lg:['Mirimu ki ezikeere era ani gwe nsooka okubuuza?','Kiki kye nsooka okukola leero?','Mpa ebifunze by emirimu gya wiiki eno','Ani alina emirimu emingi okusinga?'],
 tw:['Nnwuma bɛn na aka akyi na hena na minni n’akyi kan?','Dɛn na ɛsɛ sɛ meyɛ nnɛ?','Bɔ kuw no adwuma dapɛn yi mua','Hena na ɔwɔ nnwuma pii sen obiara?'],
};
const kinds=['overdue','attention','week','workload'];
for(const [language,phrases] of Object.entries(questions)){
 for(const [i,phrase] of phrases.entries()){
  it.each([phrase,`  ${phrase.replace(/[?.!؟]+$/u,'')}!  `])(`${language}: %s`,q=>expect(operationalIntent(q)).toBe(kinds[i]));
 }
}
it('covers every selectable language',()=>{for(const {code} of LANGUAGES)expect(questions[code.startsWith('en')?'en':code],code).toHaveLength(4);});
it.each([
 ['ما هي أوامر العمل المتأخرة ومن ينبغي متابعته أولاً؟','overdue'],['وش المتأخر ومين نتابع أول؟','overdue'],
 ['إيش يحتاج متابعة اليوم؟','attention'],['ما الذي يتطلب اهتمامي اليوم؟','attention'],
 ['لخص هذا الأسبوع لفريقي في جملتين','week'],['أعطني ملخص أسبوعي للفريق','week'],
 ['أي فني لديه أكثر أوامر العمل المفتوحة؟','workload'],['من يتحمل أكبر عبء العمل؟','workload'],
 ['Summarize this week for my team in 2 sentences.','week'],
 ['Who should I follow up first?','overdue'],['Show the workload per technician','workload'],
 ['हर तकनीशियन के लिए काम का बोझ बताओ','workload'],['कौन से काम अतिदेय हैं?','overdue'],
 ['سب سے زیادہ کھلے کام کس کے پاس ہیں؟','workload'],['ہفتہ وار خلاصہ دو','week'],
])('recognizes additional colloquial and formal requests: %s',(q,intent)=>expect(operationalIntent(q)).toBe(intent));
it.each(['Show overdue jobs at Marina','Assign overdue jobs to Sam','Send the weekly summary','أرسل ملخص هذا الأسبوع','عين الأعمال المتأخرة لعلي','आज काम रवि को सौंप दो','اس ہفتے کی رپورٹ بھیج دو','今天分配工作','What is the workload for Sam?'])('keeps scoped requests and mutations on tools: %s',q=>expect(operationalIntent(q)).toBeNull());
const alternatives:Record<string,string[]>={
 en:['Who should I chase first about late work orders?','What are today\'s priorities?','Can you give me a weekly summary?','How is the workload split across technicians?'],
 'ar-AE':['شو الأعمال اللي تجاوزت موعدها ومين نتابع؟','شو يحتاج انتباه عندنا؟','ممكن تعطيني ملخص الأسبوع للفريق؟','من لديه أكبر عدد من الأعمال المفتوحة؟'],
 hi:['अतिदेय काम दिखाओ','किस काम पर ध्यान चाहिए?','टीम का साप्ताहिक सारांश दो','प्रति तकनीशियन कितने काम हैं?'],
 ur:['دیر سے چلنے والے کام دکھائیں','کیا چیز توجہ چاہیے؟','ہفتہ وار خلاصہ بتائیں','فی ٹیکنیشن کتنے کام ہیں؟'],
 ne:['म्याद नाघेका काम देखाउनुहोस्','कुन काममा ध्यान चाहिन्छ?','साप्ताहिक सारांश देखाऊ','प्राविधिकको कामको भार कस्तो छ?'],
 bn:['মেয়াদ পেরিয়ে যাওয়া কাজ দেখান','কোন কাজে মনোযোগ দরকার?','সাপ্তাহিক সারাংশ দিন','প্রযুক্তিবিদদের কাজের চাপ দেখান'],
 ml:['കാലാവധി കഴിഞ്ഞ ജോലികൾ കാണിക്കൂ','ഏത് ജോലിക്ക് ശ്രദ്ധ വേണം?','പ്രതിവാര സംഗ്രഹം നൽകൂ','ടെക്നീഷ്യന്മാരുടെ ജോലിഭാരം കാണിക്കൂ'],
 ta:['காலக்கெடு கடந்த வேலைகளைக் காட்டு','எந்த வேலைக்கு கவனம் தேவை?','வாராந்திர சுருக்கம் தரவும்','ஒவ்வொருவரின் பணிச்சுமை என்ன?'],
 ps:['ځنډېدلي کارونه وښیه','څه پاملرنه غواړي؟','اونیز لنډیز راکړه','د تخنیکرانو کاري بار وښیه'],
 'fa-AF':['کارهای دیر شده را نشان بده','چه کاری توجه لازم دارد؟','خلاصه هفتگی تیم چیست؟','بار کاری هر تخنیکر چقدر است؟'],
 'fa-IR':['کارهای عقب افتاده را نشان بده','کدام کار توجه لازم دارد؟','خلاصه هفتگی را بگو','بار کاری تکنسین ها چقدر است؟'],
 fil:['Anong trabaho ang lampas sa takdang oras?','Ano ang kailangan ng pansin?','Pakibigay ang buod ng linggo','Ipakita ang dami ng trabaho ng mga technician'],
 'zh-CN':['列出超期的工单','哪些工作需要关注？','给我每周总结','统计每位技术员的未完成任务'],
 'sw-KE':['Onyesha kazi zilizochelewa','Ni kazi zipi zinahitaji umakini?','Nipe muhtasari wa wiki','Onyesha mzigo wa kazi wa mafundi'],
 am:['ጊዜያቸው ያለፈ ሥራዎችን አሳይ','የትኛው ሥራ ትኩረት ይፈልጋል?','የሳምንቱ ማጠቃለያ ስጠኝ','የሥራ ጫና በቴክኒሻኖች እንዴት ይከፈላል?'],
 ti:['ግዜኦም ዝሓለፈ ስራሓት ኣርእየኒ','ኣየናይ ስራሕ ትኩረት ይደሊ?','ናይ ሰሙን ጽማቕ ሃበኒ','ጾር ስራሕ ቴክኒሻናት ኣርእየኒ'],
 so:['Tus shaqooyinka daahay','Shaqadee u baahan fiiro gaar ah?','I sii warbixinta toddobaadka','Tus culayska shaqada farsamayaqaannada'],
 yo:['Iṣẹ wo ni ti pẹ?','Iṣẹ wo ló nílò akiyesi?','Fun mi ni akopọ ọsẹ','Ṣe àfihàn ẹrù iṣẹ àwọn òṣìṣẹ́'],
 ha:['Nuna ayyukan da ke da jinkiri','Wane aiki yake bukatar kulawa?','Nuna taƙaitaccen mako','Nuna nauyin aiki na masu fasaha'],
 ig:['Gosi ọrụ ndị gafere oge','Kedu ọrụ chọrọ nlebara anya?','Nye m nchịkọta izu','Gosi ibu ọrụ ndị ọrụ nka'],
 lg:['Ndaga emirimu ezayitako','Mulimu ki ogwetaaga okufaayo?','Mpa emirimu mu bufunze wiiki eno','Ndaga obuzito bw emirimu eri buli mukozi'],
 tw:['Nnwuma bɛn na atwentwɛn?','Adwuma bɛn na ehia ahwɛyiye?','Ma me dapɛn no mu nsɛm','Kyerɛ adwuma so adesoa a obiara wɔ'],
};
for(const [language,phrases] of Object.entries(alternatives))for(const [i,q] of phrases.entries())it(`${language} alternative: ${q}`,()=>expect(operationalIntent(q)).toBe(kinds[i]));
