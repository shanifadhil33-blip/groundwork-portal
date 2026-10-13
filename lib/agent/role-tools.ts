/**
 * ROLE10: the agent never does more than the person could with the buttons. Clients and technicians get only their own tools,
 * checked on the server for the in app agent and Connect AI keys alike. Office roles get every tool; admin only tools check again.
 */
/** ROLE09 client side. Office staff and households raise and follow requests; the facility manager also sees the fix history, answers prices and confirms visits. */
const CLIENT_BASE=['list_messages','send_message','needs_attention','list_suggestions','whoami','list_work_orders','get_work_order','get_work_order_by_number','create_request','add_comment','list_sites','list_job_photos','ask_choice','notification_status'];
const CLIENT_TOOLS=[...CLIENT_BASE,'fix_history','answer_quote','confirm_visit'];
const CLIENT_KIND_TOOLS:Record<string,string[]>={'client:manager':CLIENT_TOOLS,'client:office':CLIENT_BASE,'client:household':CLIENT_BASE};
const TECH_TOOLS=['list_messages','send_message','needs_attention','list_suggestions','suggest_job','whoami','my_day','list_work_orders','get_work_order','get_work_order_by_number','update_work_order_status','save_job_report','add_comment','list_job_photos','list_documents','get_schedule','notification_status','ask_choice','request_time_off','list_leave_requests'];
/** Office staff (ROLE08). They may book the Best match person only, checked in the work order service: every office tool except running the team, money and company settings. */
export const OFFICE_DENY=['approve_suggestion','decline_suggestion','set_worker_skills','add_worker','set_member_roles','rename_role','set_approval_mode','set_job_payment','decide_time_off'];
/** The tools a role may use, or null for every tool (admin and supervisor). */
export function toolsFor(role:string):string[]|null{return CLIENT_KIND_TOOLS[role]??(role==='client'?CLIENT_TOOLS:role==='technician'?TECH_TOOLS:null);}
export const allowedTool=(role:string,name:string)=>{if(role==='office')return !OFFICE_DENY.includes(name);const l=toolsFor(role);return !l||l.includes(name);};
