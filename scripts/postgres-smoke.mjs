import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {getDb} from './lib/db.mjs';import {migrate} from './migrate.mjs';import {seed} from './seed.mjs';import {checkDomain} from './check-domain.mjs';
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL must name an empty disposable database');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'freight-pg-test-'));process.env.OUTPUT_DIR=tmp;
const db=await getDb();try{const existing=await db.query("select tablename from pg_tables where schemaname='public'");if(existing.length)throw Error('Refusing nonempty test database');await migrate(db);await seed(db);await checkDomain(db,tmp);console.log('PASS PostgreSQL');}finally{await db.close();fs.rmSync(tmp,{recursive:true,force:true});}
