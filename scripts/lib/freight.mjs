import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseCsv } from './csv.mjs';

export const tables = ['clients','rates','charges','quotes','quote_lines','notes','import_batches','audit_log'];
export const currencies = ['USD','NZD','AUD','EUR','GBP','SGD','CAD'];
export function required(v,label) { if(typeof v!=='string'||!v.trim()) throw Error(`${label} is required`); return v.trim(); }
export function date(v,label='date') {const s=required(v,label); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error(`${label} must be a valid YYYY-MM-DD`);return s;}
export function integer(v,label,min=0,max=1000000000){ if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(`${label} must be an integer from ${min} to ${max}`);return v; }
export function currency(v){if(!currencies.includes(v))throw Error('Explicit supported currency required');return v;}
export function cents(v){const s=String(v).trim();if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error(`Invalid rate amount: ${s}`);return integer(Math.round(Number(s)*100),'rate cents');}
export async function transaction(db,actor,fn){required(actor,'actor');await db.exec('BEGIN');try{await db.query("select set_config('app.actor',$1,true)",[actor]);const out=await fn();await db.exec('COMMIT');return out;}catch(e){await db.exec('ROLLBACK');throw e;}}
export async function resolve(db,kind,term){
 if(!['clients','rates','charges','quotes'].includes(kind))throw Error('Unknown record type');required(term,'record');
 const name=kind==='rates'?'contract':kind==='quotes'?'code':'name';
 const exact=await db.query(`select * from ${kind} where lower(code)=lower($1) or id::text=$1`,[term]);if(exact.length===1)return exact[0];
 const rows=await db.query(`select * from ${kind} where starts_with(id::text,lower($1)) or position(lower($1) in lower(${name}))>0 order by code`,[term]);
 if(rows.length!==1){const e=Error(rows.length?'Ambiguous record; use a code or longer id':'No matching record');e.candidates=rows.map(r=>({id:r.id,code:r.code,name:r[name]}));throw e;}return rows[0];
}
const definitions={
 client:{table:'clients',fields:['code','name','purpose','retention_review']},
 rate:{table:'rates',fields:['code','contract','carrier','origin','destination','equipment','currency','buy_cents','valid_from','valid_to','source_ref','internal_note']},
 charge:{table:'charges',fields:['code','name','location','basis','currency','buy_cents','valid_to','source_ref']}
};
export async function add(db,kind,data){
 const def=definitions[kind];if(!def)throw Error('add supports client, rate, charge');
 for(const k of Object.keys(data))if(!def.fields.includes(k))throw Error(`Unknown field: ${k}`);
 for(const k of def.fields)if(!['purpose','retention_review','internal_note'].includes(k)){if(k==='buy_cents')integer(data[k],k);else required(data[k],k);}
 for(const k of ['valid_from','valid_to','retention_review'])if(data[k]!=null)date(data[k],k);
 if(kind!=='client')currency(data.currency);
 const keys=Object.keys(data);return (await db.query(`insert into ${def.table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,keys.map(k=>data[k])))[0];
}
export async function prepareQuote(db,d){
 const fields=['code','client','rate','owner','containers','markup_bps','tax_bps','sail_date','valid_until','terms','coverage_confirmed','followup_on','charges'];
 for(const k of Object.keys(d))if(!fields.includes(k))throw Error(`Unknown field: ${k}`);
 for(const k of ['code','client','rate','owner'])required(d[k],k);
 for(const k of ['sail_date','valid_until','followup_on'])date(d[k],k);
 integer(d.containers,'containers',1,1000);integer(d.markup_bps,'markup_bps',0,100000);integer(d.tax_bps,'tax_bps',0,10000);
 if(typeof d.terms!=='string'||typeof d.coverage_confirmed!=='boolean'||!Array.isArray(d.charges))throw Error('terms, explicit coverage_confirmed and charges list required');
 if(d.charges.length>100)throw Error('At most 100 local charges per quotation');
 const c=await resolve(db,'clients',d.client),found=await resolve(db,'rates',d.rate);
 const r=(await db.query('select * from rates where id=$1 for update',[found.id]))[0];
 if(!r.active)throw Error('Rate is inactive');
 const charges=[];for(const term of d.charges){const ch=await resolve(db,'charges',term);if(ch.currency!==r.currency)throw Error('Mixed currencies refused; agree a converted tariff separately');if(![r.origin,r.destination].includes(ch.location))throw Error('Charge location does not match this lane');if(charges.some(x=>x.id===ch.id))throw Error('Duplicate charge');charges.push(ch);}
 const q=(await db.query(`insert into quotes(code,client_id,owner,sail_date,valid_until,currency,markup_bps,tax_bps,terms,coverage_confirmed,followup_on) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[d.code,c.id,d.owner,d.sail_date,d.valid_until,r.currency,d.markup_bps,d.tax_bps,d.terms,d.coverage_confirmed,d.followup_on]))[0];
 await db.query(`insert into quote_lines(quote_id,rate_id,description,quantity,unit_buy_cents,source_valid_from,source_valid_to,source_ref) values($1,$2,$3,$4,$5,$6,$7,$8)`,[q.id,r.id,`${r.origin} to ${r.destination} / ${r.equipment} / ${r.carrier}`,d.containers,r.buy_cents,r.valid_from,r.valid_to,r.source_ref]);
 for(const ch of charges)await db.query(`insert into quote_lines(quote_id,charge_id,description,quantity,unit_buy_cents,source_valid_to,source_ref) values($1,$2,$3,$4,$5,$6,$7)`,[q.id,ch.id,ch.name,ch.basis==='container'?d.containers:1,ch.buy_cents,ch.valid_to,ch.source_ref]);
 return (await db.query('select * from quote_totals where id=$1',[q.id]))[0];
}
export async function decide(db,term,status,evidence,actor){const q=await resolve(db,'quotes',term);required(evidence,'evidence');if(!['approved','won','lost','withdrawn'].includes(status))throw Error('Decision must be approved, won, lost or withdrawn');
 return (await db.query(`update quotes set status=$2,decision_evidence=$3,approved_by=case when $2='approved' then $4 else approved_by end,approved_at=case when $2='approved' then now() else approved_at end where id=$1 returning code,status,decision_evidence`,[q.id,status,evidence,actor]))[0];}
export async function detail(db,term){const q=await resolve(db,'quotes',term);return {quote:(await db.query('select * from quote_totals where id=$1',[q.id]))[0],lines:await db.query('select * from quote_lines where quote_id=$1 order by created_at,id',[q.id]),notes:await db.query('select actor,body,created_at from notes where quote_id=$1 order by created_at',[q.id])};}

export const reads={
 clients:'select code,name,purpose,retention_review from clients order by code',
 rates:'select * from rate_book order by origin,destination,equipment,valid_to',
 'rate-expiry':"select code,carrier,origin||' to '||destination as lane,equipment,valid_to as expires,days_left from rate_book where active and days_left<=30 order by valid_to,code",
 charges:'select code,name,location,basis,currency,buy_cents,valid_to from charges order by code',
 quotes:'select * from quote_review order by code',
 'margin-review':'select code,client,currency,buy_cents,net_cents,profit_cents,round(100.0*profit_cents/nullif(net_cents,0),2) as margin_percent from quote_totals order by currency,profit_cents',
 'followups-due':"select code,client,owner,status,followup_on,current_date-followup_on as days_late from quote_review where status in ('draft','approved') and followup_on<=current_date order by followup_on",
 'lane-review':"select origin,destination,equipment,currency,count(*) as available_tariffs,min(buy_cents) as lowest_buy_cents,max(valid_to) as last_valid_day from rates where active and current_date between valid_from and valid_to group by origin,destination,equipment,currency order by origin,destination,equipment,currency",
 'sales-review':"select owner,status,currency,count(*) as quotes,sum(net_cents)::bigint as net_cents,sum(profit_cents)::bigint as profit_cents from quote_totals group by owner,status,currency order by owner,status,currency",
 attention:'select * from attention order by due,code',
 compliance:'select * from compliance_findings order by kind,code,rule',
 history:'select id,source_name,source_key,actor,created_at from import_batches order by created_at',
 audit:'select entity,record_id,action,actor,created_at from audit_log order by created_at,id'
};
export const insightQueries=[
 ['Which overdue quotes rely on a tariff expiring within two weeks?',`select distinct q.code,q.client,q.owner,q.followup_on from quote_totals q join quote_lines l on l.quote_id=q.id join rates r on r.id=l.rate_id where q.status in ('draft','approved') and q.followup_on<current_date and r.valid_to<=current_date+14 order by q.code`],
 ['Which drafts have less than a ten percent margin?',`select code,client,currency,net_cents,profit_cents from quote_totals where status='draft' and (net_cents=0 or profit_cents*10<net_cents) order by code`],
 ['Which quotations outlive their source tariffs?',`select distinct q.code,q.valid_until,q.sail_date from quotes q join quote_lines l on l.quote_id=q.id where greatest(q.valid_until,q.sail_date)>l.source_valid_to order by q.code`],
 ['Which active lanes have only one current tariff?',`select origin,destination,equipment,currency,count(*) as tariffs from rates where active and current_date between valid_from and valid_to group by origin,destination,equipment,currency having count(*)=1 order by origin,destination`],
 ['Which customers need a retention review and have open quotes?',`select c.code,c.name,count(q.id) as open_quotes from clients c join quotes q on q.client_id=c.id where q.status in ('draft','approved') and (c.retention_review is null or c.retention_review<=current_date or c.purpose='') group by c.id order by c.code`],
 ['Which owners have overdue follow-ups, split by currency?',`select owner,currency,count(*) as overdue,sum(profit_cents)::bigint as profit_cents from quote_totals where status in ('draft','approved') and followup_on<current_date group by owner,currency order by owner,currency`],
 ['Which draft quotes lack an explicit charge-coverage review?',`select code,owner,currency from quotes where status='draft' and not coverage_confirmed order by code`],
 ['Which open quotations use a superseded rate?',`select distinct q.code,q.owner from quotes q join quote_lines l on l.quote_id=q.id join rates r on r.id=l.rate_id where q.status in ('draft','approved') and not r.active order by q.code`],
 ['Which lanes have local charges in another currency?',`select distinct r.origin,r.destination,r.currency as freight_currency,ch.currency as local_currency from rates r join charges ch on ch.location in (r.origin,r.destination) where r.active and r.currency<>ch.currency order by r.origin,r.destination`],
 ['Which clients have more than one open quote currency?',`select c.code,c.name,count(distinct q.currency) as currencies from clients c join quotes q on q.client_id=c.id where q.status in ('draft','approved') group by c.id having count(distinct q.currency)>1 order by c.code`]
];
export async function insights(db){const out=[];for(const [question,sql]of insightQueries)out.push({question,rows:await db.query(sql)});return out;}

const equip=v=>({"20'":'20GP','20':'20GP','20GP':'20GP',"40'":'40GP','40':'40GP','40GP':'40GP',"40’":'40GP',"20’":'20GP',"40’HC":'40HC',"40'HC":'40HC','40HC':'40HC'})[String(v).replace(/\s/g,'').toUpperCase()];
const digest=v=>createHash('sha256').update(v).digest('hex');
export async function parseImport(file,opts={}){
 const bytes=fs.readFileSync(file);if(bytes.length>20*1024*1024)throw Error('Import too large; split the export');
 const records=[];let raw;
 if(path.extname(file).toLowerCase()==='.xlsx'){
  if(!['import','export'].includes(opts.direction))throw Error('XLSX requires --direction=import or export to match the Quotiss download');currency(opts.currency);
  const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);raw={worksheets:[]};
  for(const ws of wb.worksheets){
   if(ws.rowCount>50000||ws.columnCount>500)throw Error('Workbook dimensions too large');
   const cells=[];ws.eachRow({includeEmpty:true},row=>cells.push(row.values.slice(1)));raw.worksheets.push({name:ws.name,cells});
   const value=(row,col)=>{let v=ws.getCell(row,col).value;if(v&&typeof v==='object'&&!(v instanceof Date)){if('formula'in v||'sharedFormula'in v)throw Error(`Formula cell ${ws.name}!${row},${col}: export fixed values first`);if(v.richText)return v.richText.map(x=>x.text).join('');if(v.text)return v.text;throw Error('Unsupported workbook cell type');}return v==null?'':String(v).trim();};
   let found=0;
   for(let col=3;col<=ws.columnCount;col++){
    const equipment=equip(value(5,col));if(!equipment)continue;
    const port=required(value(1,col),'matrix port'),contract=required(value(2,col),'matrix contract'),carrier=required(value(3,col),'matrix carrier');
    const range=value(4,col).match(/^(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/);if(!range)throw Error('Unsupported contract validity header');
    for(let row=6;row<=ws.rowCount;row++){
     const location=value(row,1),amount=value(row,col);if(!location||/^comment$/i.test(location)||/^comment$/i.test(amount))break;
     if(!amount)continue;
     records.push({contract,carrier,origin:opts.direction==='import'?location:port,destination:opts.direction==='import'?port:location,equipment,currency:opts.currency,buy_cents:cents(amount),valid_from:date(range[1]),valid_to:date(range[2]),source_ref:`${path.basename(file)} / ${ws.name} / row ${row} column ${col}`,internal_note:'Imported inclusive freight tariff. Source workbook retained, including internal comments and surcharge breakdown. Review before quoting.'});found++;
    }
   }
   if(!found)throw Error(`No supported FCL matrix rates on worksheet ${ws.name}; nothing imported`);
  }
 }else if(path.extname(file).toLowerCase()==='.csv'){
  const rows=parseCsv(bytes.toString('utf8'));raw={rows};const map=opts.map?JSON.parse(fs.readFileSync(opts.map,'utf8')):{};
  for(const [i,row]of rows.entries()){
   const r={};for(const field of ['contract','carrier','origin','destination','equipment','currency','amount','valid_from','valid_to']){const h=map[field]||field;const k=Object.keys(row).find(k=>k.toLowerCase()===h.toLowerCase());r[field]=required(k?row[k]:'',`row ${i+2} ${field}`);}
   const equipment=equip(r.equipment);if(!equipment)throw Error('Unsupported equipment');
   records.push({contract:r.contract,carrier:r.carrier,origin:r.origin,destination:r.destination,equipment,currency:currency(r.currency),buy_cents:cents(r.amount),valid_from:date(r.valid_from),valid_to:date(r.valid_to),source_ref:`${path.basename(file)} / row ${i+2}`,internal_note:row.internal_note||''});
  }
 }else throw Error('Use a Quotiss FCL .xlsx matrix or mapped .csv, not legacy .xls');
 if(!records.length)throw Error('No rates to import');
 const keys=new Set();for(const r of records){if(r.valid_to<r.valid_from||r.origin===r.destination)throw Error('Invalid date range or identical ports');r.identity=digest(JSON.stringify([required(opts.workspace,'workspace'),r.contract,r.carrier,r.origin,r.destination,r.equipment,r.currency,r.valid_from]));if(keys.has(r.identity))throw Error('Duplicate rate identity in file; split or resolve ambiguous contracts');keys.add(r.identity);}
 return {records,raw,sourceKey:digest(Buffer.concat([bytes,Buffer.from(JSON.stringify({workspace:opts.workspace,currency:opts.currency,direction:opts.direction,map:opts.map?fs.readFileSync(opts.map,'utf8'):null}))]))};
}
export async function importRates(db,file,opts,actor){
 const parsed=await parseImport(file,opts);const existing=await db.query('select id from import_batches where source_key=$1',[parsed.sourceKey]);
 const summary={rates:parsed.records.length,currencies:[...new Set(parsed.records.map(r=>r.currency))],already_imported:existing.length>0,dry_run:Boolean(opts['dry-run']),warnings:['FCL freight totals include freight surcharges. Review local charges and internal comments separately. Rates omitted from this file are not deactivated.']};
 if(opts['dry-run']||existing.length)return summary;
 return transaction(db,actor,async()=>{
  const batch=(await db.query('insert into import_batches(source_key,source_name,actor,source_data) values($1,$2,$3,$4) returning id',[parsed.sourceKey,path.basename(file),actor,JSON.stringify(parsed.raw)]))[0];
  for(const r of parsed.records){
   await db.query('update rates set active=false where source_key like $1 and active',[r.identity+'/%']);
   const {identity,...fields}=r;const data={...fields,code:'IMP-'+randomUUID().slice(0,12),source_key:identity+'/'+parsed.sourceKey,batch_id:batch.id};const keys=Object.keys(data);
   await db.query(`insert into rates(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>data[k]));
  }return {...summary,batch_id:batch.id};
 });
}
