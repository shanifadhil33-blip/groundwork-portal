import { afterAll,expect,it } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { getTeamSpace,sendTeamMessage,listTeamMessages,moderateTeamMessage } from '../lib/services/team-space';
import { unreadMessages,markThreadRead } from '../lib/services/messages';
import { listNotifications } from '../lib/services/notifications';
import { callTool } from '../lib/agent/tools';
import { uploadSharedPhoto,getSharedPhoto } from '../lib/services/shared-photos';
afterAll(closePools);
it('one company space reaches technician and office staff in list bell and Agent',async()=>{
 const team=await getTeamSpace(ids.sam,ids.ridgeline);expect((await getTeamSpace(ids.ravi,ids.ridgeline)).id).toBe(team.id);
 const sent=await sendTeamMessage(ids.sam,ids.ridgeline,{body:'Please bring the valve',voice_note_text:'Please bring the valve'});
 for(const user of [ids.ravi,ids.nabil,ids.imran])expect((await listTeamMessages(user,ids.ridgeline)).data.some(m=>m.id===sent.id)).toBe(true);
 expect((await unreadMessages(ids.ravi,ids.ridgeline)).team_unread_count).toBe(1);
 expect((await listNotifications(ids.ravi,ids.ridgeline,new URLSearchParams('pageSize=100'))).data.some(n=>n.kind==='team_message'&&n.link_target?.entity==='team_space')).toBe(true);
 const attention=await callTool({user:ids.ravi,ws:ids.ridgeline,kind:'assistant',scope:'read'},'needs_attention',{});expect((attention.structuredContent as any).result.summary).toContain('1 new message in Team space');
 await markThreadRead(ids.ravi,ids.ridgeline,{conversation_id:team.id,through:sent.created_at.toISOString(),through_id:sent.id});expect((await unreadMessages(ids.ravi,ids.ridgeline)).team_unread_count).toBe(0);
});
it('clients households and other workspaces cannot read or send, including raw RLS and route',async()=>{
 const team=await getTeamSpace(ids.sam,ids.ridgeline);
 for(const user of [ids.pranav,ids.faisal]){
  await expect(getTeamSpace(user,ids.ridgeline)).rejects.toMatchObject({status:403});
  expect((await withUser(user,db=>db.query("SELECT id FROM conversations WHERE kind='team'"))).rowCount).toBe(0);
  await expect(withUser(user,db=>db.query("INSERT INTO messages(workspace_id,conversation_id,sender_id,sender_name,body) VALUES($1,$2,$3,'Client','Wrong space')",[ids.ridgeline,team.id,user]))).rejects.toMatchObject({code:'42501'});
 }
 const {setAuthResolverForTests}=await import('../lib/auth');const {GET}=await import('../app/api/workspaces/[ws]/team-space/route');setAuthResolverForTests(async()=>ids.faisal);
 try{expect((await GET(new Request('http://local'),{params:Promise.resolve({ws:ids.ridgeline})})).status).toBe(403);}finally{setAuthResolverForTests();}
 const other=await getTeamSpace(ids.summitAdmin,ids.summit);expect(other.id).not.toBe(team.id);
 await sendTeamMessage(ids.summitAdmin,ids.summit,{body:'Only Summit'});
 expect((await listTeamMessages(ids.sam,ids.ridgeline)).data.some(m=>m.body==='Only Summit')).toBe(false);
 await expect(getTeamSpace(ids.sam,ids.summit)).rejects.toMatchObject({status:404});
});
it('admins pin and remove, and removed content and photos cannot be read',async()=>{
 const photo=await uploadSharedPhoto(ids.sam,ids.ridgeline,{mime:'image/jpeg',width:1,height:1,data:Buffer.from([255,216,255,...Array(130).fill(0)]).toString('base64')});
 const sent=await sendTeamMessage(ids.sam,ids.ridgeline,{body:'Valve photo',photo_ids:[photo.id]});
 await expect(moderateTeamMessage(ids.sam,ids.ridgeline,sent.id,{action:'pin'})).rejects.toMatchObject({status:403});
 await moderateTeamMessage(ids.imran,ids.ridgeline,sent.id,{action:'pin'});
 expect((await listTeamMessages(ids.ravi,ids.ridgeline)).data.find(m=>m.id===sent.id)?.pinned_at).toBeTruthy();
 await moderateTeamMessage(ids.imran,ids.ridgeline,sent.id,{action:'remove'});
 expect((await listTeamMessages(ids.ravi,ids.ridgeline)).data.find(m=>m.id===sent.id)).toMatchObject({body:'Message removed by an admin',original_body:'Message removed by an admin',photo_ids:[],removed:true});
 await expect(getSharedPhoto(ids.ravi,ids.ridgeline,photo.id)).rejects.toMatchObject({status:404});
});
