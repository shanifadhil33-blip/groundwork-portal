import {expect,it} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {validTranslation,rightScript} from '../lib/i18n';
const keys=[
 "The client refused. Start a new linked request.",
 "Admins can set prices and mark jobs as paid",
 "Price approved",
 "What happened?",
 "Review price",
 "Say no",
 "Price approved. The team can go ahead.",
 "This job is not yours.",
 "That did not save. Try again.",
 "Nothing is sent until you tap Yes.",
 "Send a price before recording a refusal.",
 "Price sent to the client.",
 "Type the price as a number.",
 "There is no price to approve on this job yet.",
 "This price was already answered.",
 "This job is closed.",
 "Price changed",
 "Waiting for a price",
 "Client said no",
 "Client refused",
 "Technician statement",
 "Work is on hold until the client approves the price.",
 "The owner decides any visit charge.",
 "The visit will close. The owner decides any visit charge.",
 "Close visit",
 "Waiting prices",
 "No prices waiting.",
 "Quote visit",
 "The full price depends on what the technician finds.",
 "Only clients can request a quote visit.",
 "Ask the company to add your site before sending a request.",
 "Which site is this for?",
 "Only the owner or an admin allowed to handle money can set prices.",
 "This job was not found.",
 "The price changed. Open the job and review it again.",
 "The client must say no to the price first.",
 "Waiting for a price. Work is on hold.",
 "Client said no. Work stays on hold.",
 "Client refused. The visit is closed. No further work will continue.",
 "Client refused. The visit is closed. The owner decides any visit charge.",
 "Client refused. The visit is closed.",
 "It is not just a filter. The fan motor needs replacing. This will cost more.",
 "The fan motor needs replacing. Parts and labour.",
 "How much will it cost to fix my water heater?"
];
it('every quote label, hold, refusal, setting, error and demo phrase has all language translations',()=>{
 for(const file of readdirSync('public/i18n').filter(f=>f.endsWith('.json'))){
  const dictionary=JSON.parse(readFileSync('public/i18n/'+file,'utf8')),lang=file.slice(0,-5);
  for(const key of keys){
   expect(dictionary[key],file+': '+key).toBeTruthy();
   expect(dictionary[key],file+': '+key).not.toBe(key);
   expect(validTranslation(key,dictionary[key],lang),file+': '+key).toBe(true);
   expect(rightScript(dictionary[key],lang),file+': '+key).toBe(true);
  }
 }
});
