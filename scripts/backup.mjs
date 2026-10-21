import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
if(existsSync('.env'))process.loadEnvFile('.env');
if(process.env.DATABASE_URL)throw new Error('This local backup command is for SQLite. Use PostgreSQL backup tooling for PostgreSQL.');
const source=resolve(process.argv[2]||process.env.SQLITE_PATH||'data/adfirm.sqlite');if(!existsSync(source))throw new Error('Local database not found');
const target=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await mkdir(target,{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,join(target,'adfirm.sqlite'));}finally{db.close();}
const images=resolve(process.argv[3]||process.env.LOCAL_IMAGE_PATH||'data/images');if(existsSync(images))await cp(images,join(target,'images'),{recursive:true,errorOnExist:true});
const digest=createHash('sha256').update(await readFile(join(target,'adfirm.sqlite'))).digest('hex');
await writeFile(join(target,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),databaseSha256:digest,localImages:existsSync(images),r2ObjectsIncluded:false},null,2));
console.log('Backup created: '+target);console.log('R2 objects, unsynced devices, and secrets are not included. Keep this folder private.');
