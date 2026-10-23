// Exact data tokens only. Never exempt an entire line merely because it contains a name.
const data = /Groundwork|Ridgeline Facility Services|Harbor & Pine Coworking|Northgate Self Storage|Northgate Logistics Centre, Unit 7|Pine House, Office 1204|Larkspur Studio, Floor 3|Larkspur Coworking Studio|Marina Exchange(?:, Tower B)?|Pine Terrace(?:, Building 4)?|Harbor Annex(?:, Unit G03)?|Northgate East|Northgate West|Larkspur Loft(?:, Floor 3)?|Warehouse (?:14|9)|Al Marsa Street|Cluster D Road|King Salman Bin Abdulaziz Al Saud Street|Street (?:21|4A)|Al Khan Street|Dubai Marina|Dubai Media City|Dubai Investments Park 1|Al Quoz Industrial Area 3|Jumeirah Lake Towers|Al Majaz 3|Abu Dhabi|Dubai|Sharjah|Imran|Hassan|Sam|Ravi|Pranav(?: Menon)?|Faisal(?: Al Zaabi)?|Omar(?: Al Mansoori)?|Nabil|Kevin|Bilal|Anil|Laith(?: Haddad)?|Karim(?: Saleh)?|Arif(?: Rahman)?|Joseph Mathew|Yousef(?: Qureshi)?|Rashid(?: Al Nuaimi)?|yusuf|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:WO[- ]?\d+|QA-\d+|COBALT-DEMO-\d+)\b/gi;
/** @param {string} line */
export function hasUntranslatedLatin(line) {
  const rest = line.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '')
    .replace(/sample\.csv|Asia\/Dubai|\b(?:WO|AED|UTC)\b|Gulf Arabic|English \(India\)|United Arab Emirates|\.example/g, '')
    .replace(data, '').replace(/\bNorthgate\b/g, '');
  return /[A-Za-z]{2,}/.test(rest);
}
