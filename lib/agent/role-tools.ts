/**
 * ROLE10: the agent never does more than the person could with the buttons. Clients and technicians get only their own tools,
 * checked on the server for the in app agent and Connect AI keys alike. Office roles get every tool; admin only tools check again.
 */
/** ROLE09 client side. Facility staff raise and follow requests; a household also answers prices and confirms visits on his own requests (the server checks it is his); the facility manager also sees the fix history, answers prices and confirms visits. */
export const CLIENT_VISIT_TOOLS=['free_visit_slots','previous_technician','reschedule_visit','cancel_visit'];
const CLIENT_BASE=['visit_charge','set_my_setting',...CLIENT_VISIT_TOOLS,'my_words','remember_word','forget_word','my_memory','remember_about_me','forget_about_me','set_call_me','get_onboarding','fill_onboarding','list_contacts','suggest_contact_name','list_messages','send_message','needs_attention','list_suggestions','withdraw_request','whoami','list_work_orders','get_work_order','get_work_order_by_number','create_request','add_comment','list_sites','list_job_photos','ask_choice','notification_status'];
const CLIENT_TOOLS=[...CLIENT_BASE,'list_assets','fix_history','answer_quote','confirm_visit','waiting_prices'];
const CLIENT_KIND_TOOLS:Record<string,string[]>={'client:manager':CLIENT_TOOLS,'client:office':CLIENT_BASE,'client:household':[...CLIENT_BASE,'answer_quote','confirm_visit','waiting_prices']};
const TECH_TOOLS=['my_fixes','job_counts','list_assets','set_my_setting','my_words','remember_word','forget_word','my_memory','remember_about_me','forget_about_me','set_call_me','get_onboarding','fill_onboarding','list_contacts','suggest_contact_name','list_team_messages','send_team_message','list_messages','send_message','needs_attention','list_suggestions','suggest_job','whoami','my_day','list_work_orders','get_work_order','get_work_order_by_number','update_work_order_status','save_job_report','add_comment','list_job_photos','list_documents','get_schedule','notification_status','ask_choice','request_time_off','list_leave_requests','ask_supervisor'];
/** Office staff (ROLE08). They may book the Best match person only, checked in the work order service: every office tool except running the team, money and company settings. */
export const OFFICE_DENY=['approve_suggestion','decline_suggestion','set_worker_skills','add_worker','set_member_roles','rename_role','set_approval_mode','set_job_payment','decide_time_off','add_asset'];
/** The tools a role may use, or null for every tool (admin and supervisor). */
export function toolsFor(role:string):string[]|null{return CLIENT_KIND_TOOLS[role]??(role==='client'?CLIENT_TOOLS:role==='technician'?TECH_TOOLS:null);}
/** These checks also run before a connected key can queue a write for approval. */
export const ADMIN_ONLY=['set_job_payment','set_approval_mode','set_member_roles','rename_role'];
const ADMIN_RECORDS=['create_client','update_client','create_site','update_site'];
export const allowedTool=(role:string,name:string)=>{if(name==='contract_watch')return ['admin','staff','office'].includes(role);if(CLIENT_VISIT_TOOLS.includes(name)&&!role.startsWith('client'))return false;if([...ADMIN_ONLY,...ADMIN_RECORDS].includes(name)&&role!=='admin')return false;if(role==='office')return !OFFICE_DENY.includes(name);const l=toolsFor(role);return !l||l.includes(name);};
