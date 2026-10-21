import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkIntegrity} from '../server/integrity.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const path=resolve(process.argv[2]||process.env.SQLITE_PATH||'data/adfirm.sqlite');if(!existsSync(path))throw new Error('Database not found');
const raw=new DatabaseSync(path,{readOnly:true});const db={kind:'sqlite',async all(sql,p=[]){return raw.prepare(sql).all(...p);},async get(sql,p=[]){return raw.prepare(sql).get(...p);}};
try{const result=await checkIntegrity(db);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}finally{raw.close();}
