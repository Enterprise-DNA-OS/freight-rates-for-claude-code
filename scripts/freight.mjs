#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {table} from './lib/format.mjs';
import {reads,insights,tables,transaction,add,prepareQuote,resolve,detail,decide,importRates,required,date} from './lib/freight.mjs';

export function format(result){
 if(Array.isArray(result)){
  if(result[0]?.question)return result.map(x=>x.question+'\n'+format(x.rows)).join('\n\n');
  if(!result.length)return '  (none)';
  return table(result,Object.keys(result[0]).filter(key=>key!=='currency'||!Object.keys(result[0]).some(k=>k.endsWith('_cents'))).map(key=>({key,label:key.replace(/_cents$/,'_amount'),width:80,format:(v,r)=>key.endsWith('_cents')?`${r.currency||''} ${(Number(v)/100).toFixed(2)}`.trim():v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):v})));
 }
 if(result&&typeof result==='object')return Object.entries(result).map(([key,value])=>typeof value==='object'&&value!==null?key+'\n'+format(Array.isArray(value)?value:[value]):key+': '+value).join('\n\n');
 return String(result);
}
export function parseArgs(args){const opts={},pos=[];for(const arg of args){if(arg.startsWith('--')){const i=arg.indexOf('=');const k=arg.slice(2,i<0?undefined:i);if(k in opts)throw Error('Duplicate option');opts[k]=i<0?true:arg.slice(i+1);}else pos.push(arg);}return {opts,pos};}
const allowed=['json','actor','dry-run','workspace','currency','direction','map','help'];
export async function run(db,args){
 const {opts,pos}=parseArgs(args);for(const k of Object.keys(opts))if(!allowed.includes(k))throw Error(`Unknown option --${k}`);
 const [cmd,a,b,...rest]=pos;
 const actor=opts.actor;
 if(cmd in reads){if(pos.length!==1)throw Error('Read command takes no positional arguments');return db.query(reads[cmd]);}
 if(cmd==='insights')return insights(db);
 if(cmd==='weekly-review')return {rate_expiry:await db.query(reads['rate-expiry']),followups:await db.query(reads['followups-due']),margins:await db.query(reads['margin-review']),compliance:await db.query(reads.compliance)};
 if(cmd==='quote')return detail(db,a);
 if(cmd==='add')return transaction(db,actor,()=>add(db,a,JSON.parse(fs.readFileSync(required(b,'JSON file'),'utf8'))));
 if(cmd==='prepare-quote')return transaction(db,actor,()=>prepareQuote(db,JSON.parse(fs.readFileSync(required(a,'JSON file'),'utf8'))));
 if(cmd==='decide')return transaction(db,actor,()=>decide(db,a,b,rest.join(' '),actor));
 if(cmd==='log')return transaction(db,actor,async()=>{const q=await resolve(db,'quotes',a);return db.query('insert into notes(quote_id,actor,body) values($1,$2,$3) returning id,body',[q.id,actor,required([b,...rest].filter(Boolean).join(' '),'note')]);});
 if(cmd==='retention-review')return transaction(db,actor,async()=>{const c=await resolve(db,'clients',a);return db.query('update clients set retention_review=$2,purpose=$3 where id=$1 returning code,purpose,retention_review',[c.id,date(b),required(rest.join(' '),'purpose')]);});
 if(cmd==='deactivate-rate')return transaction(db,actor,async()=>{required(b,'reason');const r=await resolve(db,'rates',a);return db.query("update rates set active=false,internal_note=internal_note||E'\\nDeactivated: '||$2 where id=$1 returning code,active",[r.id,[b,...rest].join(' ')]);});
 if(cmd==='import'){if(a!=='quotiss')throw Error('Use import quotiss');return importRates(db,required(b,'file'),opts,actor);}
 if(cmd==='source'){return db.query('select * from import_batches where id::text=$1',[required(a,'batch id')]);}
 if(cmd==='export'){
  const data={format:'freight-rates-v1',exported_at:new Date().toISOString(),tables:{}};
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{for(const t of tables)data.tables[t]=await db.query(`select * from ${t} order by id`);}finally{await db.exec('ROLLBACK');}
  const dir=path.join(process.env.OUTPUT_DIR||REPO_ROOT,'exports');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`freight-${randomUUID()}.json`);fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});return {file,counts:Object.fromEntries(tables.map(t=>[t,data.tables[t].length]))};
 }
 if(['draft-weekly-review','draft-quote'].includes(cmd)){
  const data=cmd==='draft-quote'?await detail(db,a):await run(db,['weekly-review']);const dir=path.join(process.env.OUTPUT_DIR||REPO_ROOT,'drafts');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`${cmd}-${randomUUID()}.md`);fs.writeFileSync(file,`# Draft for operator review\n\nNot sent. Check source validity, charge coverage, tax and terms before use.\n\n${format(data)}\n`,{mode:0o600});return {file};
 }
 throw Error('Unknown command. Run --help');
}
export const help=`Freight Rates for Claude Code
Read: ${Object.keys(reads).join(', ')}, insights, weekly-review, quote <code>, source <batch-id>
Write: add client|rate|charge <json-file> --actor=NAME
prepare-quote <json-file> --actor=NAME
decide <quote> approved|won|lost|withdrawn <evidence> --actor=NAME
log <quote> <note> --actor=NAME
retention-review <client> YYYY-MM-DD <purpose> --actor=NAME
deactivate-rate <rate> <reason> --actor=NAME
import quotiss <xlsx|csv> --workspace=NAME [--direction=import|export --currency=USD] [--map=FILE] [--dry-run] --actor=NAME
export; draft-weekly-review; draft-quote <code>
All commands support --json. No command sends, books freight, or takes payments.`;
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(!args.length||args.includes('--help'))console.log(help);
 else {let db;try{db=await getDb();const result=await run(db,args);console.log(args.includes('--json')?JSON.stringify(result,null,2):format(result));}catch(e){console.error(args.includes('--json')?JSON.stringify({error:e.message,candidates:e.candidates||[]}):e.message+(e.candidates?'\n'+format(e.candidates):''));process.exitCode=1;}finally{await db?.close();}}
}
