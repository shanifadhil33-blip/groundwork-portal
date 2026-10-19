export const equipmentKinds:Record<string,string>={ac:'AC unit',water_heater:'Water heater',panel:'Electrical panel',pump:'Pump',lift:'Lift',generator:'Generator',other:'Other'};
export type Asset={id:string;site_id:string;name:string;kind:string;location:string|null;make:string|null;model:string|null;serial:string|null;installed_on:string|null;notes:string|null;archived_at:string|null};
export type AssetJob={id:string;order_number:number;title:string;status:string;finished_at:string|null;outcome:string|null;technician_name:string|null};
