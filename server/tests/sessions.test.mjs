import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {hash} from '../domain.mjs';

const password='AdfirmDemo!2026';
const phone='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const laptop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
async function setup(){const db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});return {db,app:await buildApp({db})};}
const login=(app,ua,ip='198.51.100.1',email='owner@adfirm.demo')=>app.inject({method:'POST',url:'/api/auth/login',payload:{email,password},headers:{'user-agent':ua,'cf-connecting-ip':ip}});
const call=(app,method,url,token)=>app.inject({method,url,headers:{authorization:`Bearer ${token}`}});

test('one account stays signed in on several devices at once',async()=>{
 const {db,app}=await setup();
 try{
  const signedIn=await Promise.all([phone,iphone,laptop].map(ua=>login(app,ua)));
  assert.deepEqual(signedIn.map(r=>r.statusCode),[200,200,200]);
  const [a,b,c]=signedIn.map(r=>r.json().token);
  for(const token of [a,b,c])assert.equal((await call(app,'GET','/api/stores',token)).statusCode,200);
  const list=(await call(app,'GET','/api/auth/devices',b)).json().devices;
  assert.deepEqual(list.map(d=>d.device).sort(),['Chrome on Android','Edge on Windows','Safari on iPhone']);
  assert.equal(list.filter(d=>d.current).length,1);assert.equal(list.find(d=>d.current).device,'Safari on iPhone');
  const session=await db.get('SELECT expires_at FROM sessions WHERE token_hash=?',[hash(a)]);
  assert.ok(Date.parse(session.expires_at)-Date.now()>29*86400000,'sessions last 30 days');
  // Signing out one other device leaves the rest signed in.
  assert.equal((await call(app,'DELETE',`/api/auth/devices/${hash(b)}`,b)).statusCode,400);
  assert.equal((await call(app,'DELETE',`/api/auth/devices/${hash(c)}`,a)).statusCode,200);
  const ended=await call(app,'GET','/api/stores',c);assert.equal(ended.statusCode,401);assert.match(ended.json().error,/signed out on this device/);
  assert.equal((await call(app,'GET','/api/stores',a)).statusCode,200);assert.equal((await call(app,'GET','/api/stores',b)).statusCode,200);
  assert.equal((await call(app,'DELETE',`/api/auth/devices/${hash(c)}`,a)).statusCode,404);
  const cashier=(await login(app,phone,'198.51.100.2','cashier@adfirm.demo')).json().token;
  assert.equal((await call(app,'DELETE',`/api/auth/devices/${hash(a)}`,cashier)).statusCode,404,'cannot sign out another account');
  assert.equal((await call(app,'GET','/api/stores',a)).statusCode,200);
 }finally{await app.close();await db.close();}
});

test('a device in use keeps renewing its session',async()=>{
 const {db,app}=await setup();
 try{
  const token=(await login(app,phone)).json().token;
  const soon=new Date(Date.now()+60000).toISOString(),old=new Date(Date.now()-86400000).toISOString();
  await db.run('UPDATE sessions SET expires_at=?,last_seen_at=? WHERE token_hash=?',[soon,old,hash(token)]);
  assert.equal((await call(app,'GET','/api/stores',token)).statusCode,200);
  const renewed=await db.get('SELECT expires_at,last_seen_at FROM sessions WHERE token_hash=?',[hash(token)]);
  assert.ok(Date.parse(renewed.expires_at)-Date.now()>29*86400000);assert.ok(renewed.last_seen_at>old);
  await db.run('UPDATE sessions SET expires_at=? WHERE token_hash=?',[old,hash(token)]);
  assert.equal((await call(app,'GET','/api/stores',token)).statusCode,401,'an expired session stays expired');
 }finally{await app.close();await db.close();}
});

test('request limits are per device and sign-in limits per visitor',async()=>{
 const {db,app}=await setup();
 try{
  const [a,b]=await Promise.all([login(app,phone,'198.51.100.7'),login(app,laptop,'198.51.100.7')]).then(r=>r.map(x=>x.json().token));
  let last;for(let i=0;i<300;i++)last=await call(app,'GET','/api/me',a);
  assert.equal(last.statusCode,200);assert.equal((await call(app,'GET','/api/me',a)).statusCode,429);
  assert.equal((await call(app,'GET','/api/me',b)).statusCode,200,'another device in the same store is unaffected');
  const statuses=[];for(let i=0;i<10;i++)statuses.push((await login(app,phone,'203.0.113.10')).statusCode);
  assert.ok(statuses.every(s=>s===200));assert.equal((await login(app,phone,'203.0.113.10')).statusCode,429);
  assert.equal((await login(app,phone,'203.0.113.11')).statusCode,200,'other visitors can still sign in');
 }finally{await app.close();await db.close();}
});
