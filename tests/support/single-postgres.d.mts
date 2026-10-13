export class Pool { constructor(options:{connectionString:string}); connect():Promise<any>; query(sql:string,values?:unknown[]):Promise<any>; end():Promise<void>; }
export function stop():Promise<void>;
