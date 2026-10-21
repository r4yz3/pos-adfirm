import {resolve,join,sep} from 'node:path';
import {homedir,userInfo} from 'node:os';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {checkIntegrity} from '../server/integrity.mjs';
const root=process.env.ADFIRM_DEPLOY_HOME||join(homedir(),'apps/adfirm-pos');
if(!process.argv[2])throw new Error('Provide the native backup directory');
const folder=resolve(process.argv[2]);
if(!folder.startsWith(join(root,'backups')+sep))throw new Error('Use a backup inside this deployment backup directory');
const archive=join(folder,'adfirm.dump'),expected=(await readFile(join(folder,'adfirm.dump.sha256'),'utf8')).split(/\s/)[0];
if(createHash('sha256').update(await readFile(archive)).digest('hex')!==expected)throw new Error('Backup checksum failed');
const name='adfirm_restore_'+randomUUID().replaceAll('-','');
const env={...process.env,PGHOST:join(root,'run'),PGPORT:'55432',PGUSER:userInfo().username};
const run=(tool,args)=>{const result=spawnSync(join(root,'runtime/postgresql/bin',tool),args,{env,encoding:'utf8'});if(result.error||result.status!==0)throw new Error(`${tool} failed during isolated backup verification`);};
let created=false,client;
try{
 run('createdb',['--owner=adfirm_app',name]);created=true;
 run('pg_restore',['--dbname='+name,'--no-owner','--role=adfirm_app','--exit-on-error',archive]);
 client=new pg.Client({host:env.PGHOST,port:55432,user:env.PGUSER,database:name});await client.connect();
 const all=async(sql,values=[])=>{let n=0;return (await client.query(sql.replace(/\?/g,()=>`$${++n}`),values)).rows;};
 await client.query('BEGIN READ ONLY');const result=await checkIntegrity({kind:'postgres',all,get:async(sql,p)=>(await all(sql,p))[0]});await client.query('ROLLBACK');
 if(!result.ok)throw new Error('Restored accounting integrity failed');
 console.log('PASS: PostgreSQL backup checksum, isolated database restore and accounting integrity.');
}finally{
 if(client)await client.end();
 if(created)run('dropdb',[name]); // Only this run's uniquely named diagnostic database.
}
