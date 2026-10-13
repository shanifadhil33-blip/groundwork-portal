// Sandbox test adapter: real PostgreSQL through stdin, with no TCP or Unix sockets.
// Sessions are serialized. Use the normal pg runner for concurrent transaction tests.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),{types}=require('pg'),{prepareValue}=require('pg/lib/utils');
let backend,output='',errors='',pending=null,ready;
let gate=Promise.resolve();
function start(){
 if(backend)return ready;
 ready=new Promise((resolve,reject)=>{
  backend=spawn('/usr/bin/stdbuf',['-o0','-e0','/usr/lib/postgresql/17/bin/postgres','--single','-D',process.env.SINGLE_PG_DIR,'-j','-c','log_error_verbosity=verbose','postgres'],{stdio:['pipe','pipe','pipe']});
  backend.stderr.on('data',b=>{errors+=b.toString();if(process.env.SINGLE_PG_DEBUG)console.log('PG error',b.toString());});
  backend.stdout.on('data',b=>{output+=b.toString();if(process.env.SINGLE_PG_DEBUG)console.log('PG output',JSON.stringify(b.toString()));if(!output.endsWith('backend> '))return;const result=output;output='';const error=errors;errors='';if(pending){const done=pending;pending=null;setTimeout(()=>done(result,error),10);}else resolve();});
  backend.on('error',reject);backend.on('exit',code=>{if(code&&pending){pending('',errors);pending=null;}if(code)reject(new Error(errors));});
 });return ready;
}
function literal(value){const v=prepareValue(value);if(v==null)return 'NULL';if(Buffer.isBuffer(v))return "decode('"+v.toString('hex')+"','hex')";return "'"+String(v).replaceAll("'","''")+"'";}
async function raw(sql,values=[]){
 if(process.env.SINGLE_PG_DEBUG)console.log(sql.slice(0,80));
 await start();const statement=sql.replace(/\$(\d+)\b/g,(_,n)=>literal(values[Number(n)-1]));
 return new Promise((resolve,reject)=>{pending=(result,err)=>{
  const failure=(err+errors).match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5}):\s*([^\n]*)/);
  if(failure){errors='';return reject(Object.assign(new Error(failure[2]),{code:failure[1]}));}
  const columns=[...result.matchAll(/\t\s*\d+: ([^\t\n=]+)\t\(typeid/g)].map(m=>m[1]);
  const blank=()=>Object.fromEntries(columns.map(k=>[k,null]));
  const rows=[];let row={};
  const pattern=/\t\s*(\d+): ([^\t\n]+) = (?:"([\s\S]*?)"|<>|NULL)\t\(typeid = (\d+),[^\n]*\)/g;
  for(const m of result.matchAll(pattern)){if(Number(m[1])===1&&Object.keys(row).length){rows.push(row);row={};}if(!Object.keys(row).length)row=blank();row[m[2]]=m[3]===undefined?null:types.getTypeParser(Number(m[4]))(m[3]);}
  if(Object.keys(row).length)rows.push(row);
  if(!rows.length&&columns.length){const nullRows=result.split('\t----\n').length-2;for(let i=0;i<nullRows;i++)rows.push(blank());}
  resolve({rows,rowCount:rows.length});
 };backend.stdin.write(statement.replace(/\n\s*\n/g,'\n')+';\n\n');});
}
async function acquire(role){let unlock;const previous=gate;gate=new Promise(r=>unlock=r);await previous;await raw(role==='portal_app'?'SET ROLE portal_app':'RESET ROLE');return {query:async(sql,v)=>{if(/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)&&!sql.includes(';')&&!/\bRETURNING\b/i.test(sql))sql+=' RETURNING 1 AS _affected';return raw(sql,v);},release:()=>unlock()};}
export class Pool{
 constructor(options){this.role=new URL(options.connectionString).username==='portal_app'?'portal_app':'owner';}
 connect(){return acquire(this.role);}
 async query(sql,v){const c=await this.connect();try{return await c.query(sql,v);}finally{c.release();}}
 async end(){}
}
export async function stop(){if(backend){backend.stdin.end();await new Promise(r=>backend.on('exit',r));backend=null;}}
