/**
 * ROLE10: the agent never does more than the person could with the buttons. Clients and technicians get only their own tools,
 * checked on the server for the in app agent and Connect AI keys alike. Office roles get every tool; admin only tools check again.
 */
const CLIENT_TOOLS=['whoami','list_work_orders','get_work_order','get_work_order_by_number','create_request','add_comment','list_sites','list_job_photos','ask_choice','notification_status'];
const TECH_TOOLS=['whoami','my_day','list_work_orders','get_work_order','get_work_order_by_number','update_work_order_status','save_job_report','add_comment','list_job_photos','list_documents','get_schedule','notification_status','ask_choice','request_time_off','list_leave_requests'];
/** Office staff (ROLE11): every office tool except running the team, money and company settings. */
export const OFFICE_DENY=['assign_work_order','set_worker_skills','add_worker','set_member_roles','rename_role','set_approval_mode','set_job_payment','decide_time_off','suggest_worker'];
/** The tools a role may use, or null for every tool (admin and supervisor). */
export function toolsFor(role:string):string[]|null{return role==='client'?CLIENT_TOOLS:role==='technician'?TECH_TOOLS:null;}
export const allowedTool=(role:string,name:string)=>{if(role==='office')return !OFFICE_DENY.includes(name);const l=toolsFor(role);return !l||l.includes(name);};
