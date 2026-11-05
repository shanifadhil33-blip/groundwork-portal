/** Normalize Arabic spelling marks without removing Hindi or Urdu vowel letters. */
export const assignmentText = (text: string) => text.normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640]/gu, '').replace(/\s+/g, ' ').trim();

/** Action requests must not become read answers just because they contain a WO number. */
export function assignmentIntent(question: string): boolean {
 const q = assignmentText(question);
 if (/\b(?:assign|reassign|reschedule|move|book)\b/iu.test(q)) return true;
 if (/\bgive\b.+\bto\b/iu.test(q)) return true;
 if (/^(?:please\s+)?schedule\s+(?:WO|job|work order)\b/iu.test(q)) return true;
 // Unicode letter boundaries: JavaScript's \b does not delimit Arabic, Hindi or Urdu words.
 if (/^(?:(?:لو سمحت|ممكن|رجاء)\s+)?(?:عط|عطي|اعط|أعط|اعطي|أعطي|خل|خلي|حول|سلم|وزع|اسند|أسند|عين|جدول|احجز|انقل|غير)(?=\s|$)/u.test(q)) return true;
 if (/(?:को\s+(?:दो|दे\s+दो|दें|सौंपो|सौंप\s+दो)|सौंपो|(?:शेड्यूल|तय)\s+(?:करो|कर\s+दो|करें)|کو\s+(?:دو|دے\s+دو|دیں)|(?:شیڈول|منتقل)\s+(?:کرو|کر\s+دو|کریں))/u.test(q)) return true;
 // A short recipient construction is also a request, unless explicitly asking who has the job.
 return /^(?:WO|Job\s*#?|مهمة\s*#?)\s*\d+\s+لـ?\s*\p{L}/iu.test(q) && !/(?:^|\s)(?:من|مين|لمن|لمين|هل)(?=\s|$)|[?؟]/u.test(q);
}

/** Internal model guidance only, never displayed as product copy. */
export const ASSIGNMENT_PROMPT = 'Understand assignment and visit changes in Gulf Arabic, Hindi and Urdu, including mixed English job numbers and names. Gulf Arabic عط، عطي، خل، خلي، حول، سلّم، وزّع and Job #N لـ <name> ask to assign or reassign, not to show details. Hindi <name> को दो or को सौंपो and Urdu <name> کو دو or کو دے دو mean give the job to that person. For example عط Job #3 لـ Anil يوم السبت means Give Job #3 to Anil on Saturday. Resolve the job number with get_work_order_by_number and the person with list_team, then call assign_work_order. For a visit change without a new person use update_work_order_dates (clients use reschedule_visit). Preserve the requested day: السبت Saturday, الأحد Sunday, الاثنين Monday, الثلاثاء Tuesday, الأربعاء Wednesday, الخميس Thursday, الجمعة Friday; اليوم today, بكرة or باجر tomorrow; Hindi आज today, कल tomorrow; Urdu آج today, کل tomorrow. Work out dates in the workspace timezone. Keep the existing visit time when only the day changes; if there is no visit time or the date or person is unclear, ask one short question. Never replace a requested change with a lookup reply. The app handles confirmation and off day refusals.';
