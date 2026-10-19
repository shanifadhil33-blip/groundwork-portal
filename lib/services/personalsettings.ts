import { z } from 'zod';
import { getPreferences, patchPreferences, preferencesSchema } from './settings';
import { PERSONAL_SETTINGS, settingNotice, settingRefusal, type PersonalSetting, type SettingValue } from '../agent/personalsettings';
export const settingInput=z.object({setting:z.string(),value:z.union([z.string(),z.boolean(),z.null()])}).strict();
export async function setMySetting(user:string,input:unknown){
 const parsed=settingInput.safeParse(input);
 if(!parsed.success)return {reply:settingRefusal(),choices:[]};
 const {setting,value}=parsed.data;
 if(!PERSONAL_SETTINGS.includes(setting as PersonalSetting))return {reply:settingRefusal(setting),choices:[]};
 const validated=preferencesSchema.safeParse({[setting]:value});
 if(!validated.success)return {reply:'That value is not available. Choose a valid value in your personal settings.',choices:[]};
 const previous=await getPreferences(user);
 const saved=await patchPreferences(user,validated.data);
 const next=(saved?.[setting]??validated.data[setting as keyof typeof validated.data]) as SettingValue;
 return {reply:settingNotice(setting as PersonalSetting,next,previous[setting]??(setting==='reply_length'?'normal':null)),choices:['Undo'],setting_change:{setting:setting as PersonalSetting,value:next}};
}
