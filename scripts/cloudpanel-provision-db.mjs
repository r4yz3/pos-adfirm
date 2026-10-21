import pg from 'pg';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir,userInfo} from 'node:os';
const root=process.env.ADFIRM_DEPLOY_HOME||join(homedir(),'apps/adfirm-pos');
const envPath=join(root,'shared','.env');
process.loadEnvFile(envPath);
if(!/^[a-f0-9]{64}$/.test(process.env.POSTGRES_PASSWORD||''))throw new Error('Use the prepared random database password');
const admin=new pg.Client({host:join(root,'run'),port:55432,user:userInfo().username,database:'postgres'});
await admin.connect();
try{
 if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='adfirm_app'")).rowCount){
  const result=await admin.query("SELECT format('CREATE ROLE adfirm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text) AS sql",[process.env.POSTGRES_PASSWORD]);
  await admin.query(result.rows[0].sql);
 }
 if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='adfirm'")).rowCount)await admin.query('CREATE DATABASE adfirm OWNER adfirm_app');
}finally{await admin.end();}
let text=await readFile(envPath,'utf8');
text=text.replace(/^DATABASE_URL=.*\r?\n?/gm,'');
text+=`DATABASE_URL=postgresql://adfirm_app:${process.env.POSTGRES_PASSWORD}@127.0.0.1:55432/adfirm\n`;
await writeFile(envPath,text,{mode:0o600});await chmod(envPath,0o600);
const passPath=join(root,'shared','.pgpass');
await writeFile(passPath,`127.0.0.1:55432:*:adfirm_app:${process.env.POSTGRES_PASSWORD}\n`,{mode:0o600});await chmod(passPath,0o600);
console.log('Native PostgreSQL application role and database ready. Private connection configured.');
