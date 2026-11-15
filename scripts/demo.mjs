import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {getDb,REPO_ROOT} from './lib/db.mjs';import {migrate} from './migrate.mjs';import {seed} from './seed.mjs';import {run,format} from './freight.mjs';
fs.mkdirSync(path.join(REPO_ROOT,'.data'),{recursive:true});
const dir=fs.mkdtempSync(path.join(REPO_ROOT,'.data/demo-'));
process.env.DATABASE_URL='';process.env.DATA_DIR=path.join(dir,'db');process.env.OUTPUT_DIR=dir;
const db=await getDb();try{await migrate(db);await seed(db);for(const c of ['rate-expiry','margin-review','compliance'])console.log(`\n${c}\n${format(await run(db,[c]))}`);}finally{await db.close();}
for(const script of ['view','docs']){const r=spawnSync(process.execPath,[`scripts/${script}.mjs`],{cwd:REPO_ROOT,env:process.env,stdio:'inherit'});if(r.status!==0)throw Error(`${script} failed`);}
console.log(`Demo records and documents: ${dir}`);
