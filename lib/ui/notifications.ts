type WorkNotification = {id:string;read_at:string|null;link_target:{entity:string;id:string}|null};
// Navigation waits for the read receipt so the bell stays in sync with the opened item.
export async function openNotificationTarget(item:WorkNotification,markRead:(id:string)=>Promise<unknown>,navigate:(id:string)=>void) {
 if(!item.link_target||!['work_order','work_orders'].includes(item.link_target.entity))return false;
 if(!item.read_at)await markRead(item.id);
 navigate(item.link_target.id);
 return true;
}
