import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {migrate} from './migrate.mjs';
import {seed} from './seed.mjs';
import {checkDomain} from './check-domain.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'freight-test-'));
process.env.DATABASE_URL='';process.env.DATA_DIR=path.join(tmp,'db');process.env.OUTPUT_DIR=tmp;
let db;
try{
 db=await getDb();assert.equal((await migrate(db)).ran.length,1);assert.equal((await migrate(db)).ran.length,0);await seed(db);await seed(db);await checkDomain(db,tmp);await db.close();db=null;
 const child=(script,args=[])=>{const r=spawnSync(process.execPath,[script,...args],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 assert(JSON.parse(child('scripts/freight.mjs',['attention','--json'])).length>0);
 const ambiguous=spawnSync(process.execPath,['scripts/freight.mjs','quote','Q-10','--json'],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});assert.equal(ambiguous.status,1);assert.equal(JSON.parse(ambiguous.stderr).candidates.length,3);
 assert(child('scripts/freight.mjs',['--help']).includes('prepare-quote'));
 child('scripts/view.mjs');child('scripts/docs.mjs');
 assert.equal(fs.readdirSync(path.join(tmp,'views')).length,3);
 const quoteFiles=fs.readdirSync(path.join(tmp,'docs-out/freight-quote'));assert(quoteFiles.length>=4);
 const quoteHtml=fs.readFileSync(path.join(tmp,'docs-out/freight-quote',quoteFiles[0]),'utf8');assert(!quoteHtml.includes('unit buy'));assert(!quoteHtml.includes('profit'));assert(quoteHtml.includes('Harbour Freight Demo'));
 console.log('PASS npm test: isolated database, all commands, CLI errors, three dashboards and two document types');
}finally{await db?.close();fs.rmSync(tmp,{recursive:true,force:true});}
