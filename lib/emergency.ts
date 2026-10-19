/**
 * Emergency words in the languages our technicians and clients use. A match raises the job to urgent
 * and the Agent puts a short safety line first. Replies are shown in the reader's language by the page translator.
 */
export type Emergency = 'gas' | 'fire' | 'flood' | 'electric' | 'people';
const WORDS: Record<Emergency, string[]> = {
  people: ['stuck in the lift', 'trapped in the elevator', 'someone is hurt', 'he fell', 'injured', 'unconscious', 'مصاب', 'فاقد الوعي', 'عالق في المصعد', 'घायल', 'बेहोश', 'لفٹ میں پھنس', 'زخمی', 'بے ہوش', 'പരിക്കേറ്റു', 'ബോധരഹിതൻ', 'காயமடைந்தார்', 'மயக்கம்', 'nasugatan', 'walang malay', 'nakulong sa elevator'],
  gas: ['smell gas', 'smells like gas', 'gas leak', 'smell of gas', 'smells of gas', 'gas smell', 'تسرب غاز', 'رائحة غاز', 'ريحة غاز', 'गैस लीक', 'गैस की गंध', 'گیس لیک', 'گیس کی بو', 'ഗ്യാസ് ലീക്ക്', 'গ্যাস লিক', 'tagas ng gas', 'amoy gas'],
  fire: ['fire', 'smoke', 'burning smell', 'on fire', 'حريق', 'دخان', 'نار', 'आग', 'धुआं', 'धुआँ', 'آگ', 'دھواں', 'തീ', 'പുക', 'আগুন', 'ধোঁয়া', 'sunog', 'usok'],
  flood: ['water pouring from the ceiling', 'ceiling is leaking a lot', 'flood', 'flooding', 'water everywhere', 'burst pipe', 'pipe burst', 'فيضان', 'غرق', 'انفجار ماسورة', 'بڑا رساؤ', 'बाढ़', 'पाइप फट', 'വെള്ളപ്പൊക്കം', 'বন্যা', 'baha'],
  electric: ['burning smell from the panel', 'sparks', 'sparking', 'spark', 'electric shock', 'shock from', 'exposed wire', 'live wire', 'شرارة', 'شرر', 'صعق', 'كهرباء مكشوفة', 'चिंगारी', 'करंट', 'چنگاری', 'کرنٹ', 'തീപ്പൊരി', 'ഷോക്ക്', 'স্পার্ক', 'শক', 'kislap', 'kuryente'],
};
const ORDER: Emergency[] = ['people', 'gas', 'electric', 'fire', 'flood'];
export function detectEmergency(text: string | null | undefined): Emergency | null {
  if (isFalseAlarm(text)) return null;
  let t = ` ${(text ?? '').toLowerCase()} `;
  // Routine equipment names are not emergencies.
  for (const safe of ['fire alarm', 'fire extinguisher', 'fire door', 'fire panel', 'fire safety', 'fire pump', 'fire exit', 'fire hose', 'fire sprinkler', 'smoke detector', 'smoke alarm', 'smoke sensor', 'spark plug', 'gas cylinder refill', 'gas stove service', 'flood light', 'floodlight', 'lift service', 'gas meter reading', 'nobody was injured', 'no one was injured', 'nobody injured', 'no one injured', 'not injured', 'nobody is hurt', 'no one is hurt', 'nobody got hurt', 'no one got hurt']) t = t.split(safe).join(' ');
  for (const k of ORDER) for (const w of WORDS[k]) {
    if (/^[a-z ]+$/.test(w) ? new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t) : t.includes(w)) return k;
  }
  return null;
}
export function isFalseAlarm(text: string | null | undefined) {
  return /\b(?:it was not gas|false alarm|sorry it was nothing)\b/i.test(text ?? '');
}
export const SAFETY: Record<Emergency, string> = {
  people: 'Call 999 for police, 998 for an ambulance or 997 for civil defence now. Groundwork does not replace emergency services.',
  gas: 'Safety first: do not use switches or flames, open the windows, leave the area and call 997 if the smell is strong.',
  fire: 'Safety first: leave the area now and call 997. Do not try to fight a large fire.',
  flood: 'Safety first: turn off the main water valve if it is safe, and keep away from water near sockets or power.',
  electric: 'Safety first: do not touch it. Turn off the breaker if it is safe, and keep people away.',
};
export function safetyLine(text: string | null | undefined) { const k = detectEmergency(text); return k ? SAFETY[k] : null; }
