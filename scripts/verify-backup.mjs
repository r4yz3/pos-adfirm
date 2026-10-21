import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {checkIntegrity} from '../server/integrity.mjs';
const folder=process.argv[2];if(!folder)throw new Error('Usage: npm run backup:verify -- <backup-folder>');
const target=resolve(folder),manifest=JSON.parse(await readFile(join(target,'manifest.json'),'utf8')),bytes=await readFile(join(target,'adfirm.sqlite'));
if(createHash('sha256').update(bytes).digest('hex')!==manifest.databaseSha256)throw new Error('Backup checksum mismatch');
const raw=new DatabaseSync(join(target,'adfirm.sqlite'),{readOnly:true});const db={kind:'sqlite',async all(sql,p=[]){return raw.prepare(sql).all(...p);},async get(sql,p=[]){return raw.prepare(sql).get(...p);}};
try{const result=await checkIntegrity(db);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}finally{raw.close();}
