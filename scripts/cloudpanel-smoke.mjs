import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const base=process.env.ADFIRM_CHECK_URL||'http://127.0.0.1:4100';
const request=(path,options={})=>fetch(base+path,{...options,signal:AbortSignal.timeout(20000)});
const health=await (await request('/api/health')).json();
assert.deepEqual(health,{status:'ok',database:'postgres',storage:'r2',demo:false});
assert.equal((await request('/')).status,200);
assert.equal((await request('/api/admin/overview')).status,401);
assert.equal((await request('/api/auth/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'superadmin'})})).status,404);
if(process.env.BOOTSTRAP_ADMIN_PASSWORD&&process.env.ADFIRM_SKIP_LOGIN!=='true'){
 const response=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.BOOTSTRAP_ADMIN_EMAIL,password:process.env.BOOTSTRAP_ADMIN_PASSWORD})});assert.equal(response.status,200);
 const session=await response.json(),headers={Authorization:`Bearer ${session.token}`};
 assert.equal(session.user.role,'superadmin');
 const integrity=await (await request('/api/admin/integrity',{headers})).json();assert.equal(integrity.ok,true);
 assert.equal((await request('/api/auth/logout',{method:'POST',headers})).status,200);
 console.log('PASS: admin login, accounting integrity and logout');
}
const secrets=Object.entries(process.env).filter(([key,value])=>value&&/SECRET|PASSWORD|ACCESS_KEY_ID|DATABASE_URL/.test(key)).map(([,value])=>Buffer.from(value));
async function scan(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=join(folder,item.name);if(item.isDirectory())await scan(file);else{const bytes=await readFile(file);assert.ok(!secrets.some(value=>bytes.includes(value)),`Secret found in web build: ${file}`);}}}
await scan('dist');
console.log('PASS: native HTTPS/API target, private admin routes, demo disabled and no configured secrets in web assets');
