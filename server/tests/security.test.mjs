import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {secureAccount} from '../security.mjs';
let db,app,owner,otherOwner,admin,cashier;
const initial='AdfirmDemo!2026',changed='ChangedPassword!2026';
async function call(method,url,payload,token=owner){const r=await app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});return {status:r.statusCode,body:r.json()};}
before(async()=>{db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});app=await buildApp({db,demo:true});owner=(await call('POST','/api/auth/demo',{role:'owner'},'')).body.token;otherOwner=(await call('POST','/api/auth/demo',{role:'owner'},'')).body.token;admin=(await call('POST','/api/auth/demo',{role:'superadmin'},'')).body.token;cashier=(await call('POST','/api/auth/demo',{role:'cashier'},'')).body.token;});
after(async()=>{await app.close();await db.close();});
test('session details are private and failed password checks change nothing',async()=>{
 assert.equal((await call('GET','/api/auth/sessions',undefined,'')).status,401);
 assert.deepEqual((await call('GET','/api/auth/sessions')).body,{activeSessions:2});
 assert.equal((await call('POST','/api/auth/password',{currentPassword:'wrong',newPassword:changed})).status,400);
 assert.equal((await call('POST','/api/auth/password',{currentPassword:initial,newPassword:'short'})).status,400);
 assert.equal((await call('POST','/api/auth/password',{currentPassword:initial,newPassword:initial})).status,400);
 assert.equal((await call('GET','/api/me',undefined,otherOwner)).status,200);
});
test('password change revokes other owner sessions and preserves other users',async()=>{
 const result=await call('POST','/api/auth/password',{currentPassword:initial,newPassword:changed});assert.equal(result.status,200);assert.equal(result.body.revokedSessions,1);
 assert.equal((await call('GET','/api/me',undefined,otherOwner)).status,401);assert.equal((await call('GET','/api/me')).status,200);
 assert.equal((await call('GET','/api/me',undefined,admin)).status,200);assert.equal((await call('GET','/api/me',undefined,cashier)).status,200);
 assert.equal((await call('POST','/api/auth/login',{email:'owner@adfirm.demo',password:initial},'')).status,401);
 assert.equal((await call('POST','/api/auth/login',{email:'owner@adfirm.demo',password:changed},'')).status,200);
 const events=await db.all("SELECT details FROM audit_events WHERE action='account.password_changed'");assert.equal(events.length,1);assert.ok(events.every(e=>!e.details.includes(changed)&&!e.details.includes(initial)));
});
test('sign out others needs password proof and only touches the signed-in user',async()=>{
 assert.equal((await call('POST','/api/auth/revoke-others',{currentPassword:'wrong'})).status,400);
 assert.equal((await call('POST','/api/auth/revoke-others',{currentPassword:changed})).status,200);
 assert.equal((await call('GET','/api/auth/sessions')).body.activeSessions,1);
 await assert.rejects(()=>secureAccount(db,{id:'owner-demo'},otherOwner,{currentPassword:changed}),e=>e.statusCode===401);
 assert.equal((await call('GET','/api/me',undefined,admin)).status,200);
});
test('cashiers and admins can change their own passwords',async()=>{
 for(const token of [cashier,admin]){const r=await call('POST','/api/auth/password',{currentPassword:initial,newPassword:changed},token);assert.equal(r.status,200);assert.equal((await call('GET','/api/me',undefined,token)).status,200);}
});
test('concurrent old-password login cannot survive password-change completion',async()=>{
 const next='AnotherPassword!2026';const [login,change]=await Promise.all([call('POST','/api/auth/login',{email:'owner@adfirm.demo',password:changed},''),call('POST','/api/auth/password',{currentPassword:changed,newPassword:next})]);assert.equal(change.status,200);
 assert.ok([200,401].includes(login.status));if(login.status===200)assert.equal((await call('GET','/api/me',undefined,login.body.token)).status,401);
 assert.equal((await call('GET','/api/me')).status,200);
});
