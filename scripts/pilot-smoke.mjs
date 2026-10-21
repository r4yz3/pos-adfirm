import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const directory=resolve('artifacts',`pilot-smoke-${randomUUID()}`);await mkdir(directory,{recursive:true});
const password=randomUUID()+'Aa!',email='pilot-smoke@example.test';
const env={...process.env,NODE_ENV:'development',DEMO_MODE:'false',HOST:'127.0.0.1',PORT:'0',SQLITE_PATH:resolve(directory,'adfirm.sqlite'),LOCAL_IMAGE_PATH:resolve(directory,'images'),DATABASE_URL:'',BOOTSTRAP_ADMIN_EMAIL:email.toUpperCase(),BOOTSTRAP_ADMIN_PASSWORD:password,VISION_ENABLED:'false',R2_ACCOUNT_ID:'',R2_ACCESS_KEY_ID:'',R2_SECRET_ACCESS_KEY:'',R2_BUCKET:''};
const child=spawn(process.execPath,['server/index.mjs'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>{logs+=b.toString();});child.stderr.on('data',b=>{logs+=b.toString();});
try{let origin;for(let i=0;i<100;i++){origin=logs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(origin)break;if(child.exitCode!==null)throw new Error('Pilot server stopped during startup');await new Promise(r=>setTimeout(r,200));}if(!origin)throw new Error('Pilot startup timed out');
 const health=await(await fetch(origin+'/api/health')).json();assert.equal(health.demo,false);assert.equal(health.database,'sqlite');assert.equal(health.storage,'local');assert.equal((await fetch(origin+'/api/auth/demo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner'})})).status,404);
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const session=await login.json();assert.equal(session.user.role,'superadmin');const checked=await fetch(origin+'/api/admin/integrity',{headers:{authorization:`Bearer ${session.token}`}});assert.equal((await checked.json()).ok,true);assert.equal((await fetch(origin)).status,200);console.log('PASS: separate local pilot database, admin bootstrap/login, no demo shortcuts, local storage, and integrity checks.');
}finally{child.kill();}
