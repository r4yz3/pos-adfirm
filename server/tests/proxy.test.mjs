import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../database.mjs';
import {buildApp} from '../app.mjs';
test('Android preflight permits required update methods only for configured origins',async()=>{
 const db=await openDatabase({path:':memory:',url:null});const app=await buildApp({db});
 try{
  const request=origin=>app.inject({method:'OPTIONS',url:'/api/stores/store-main/products/test',headers:{origin,'access-control-request-method':'PATCH','access-control-request-headers':'authorization,content-type'}});
  const allowed=await request('https://localhost');assert.equal(allowed.statusCode,204);assert.equal(allowed.headers['access-control-allow-origin'],'https://localhost');assert.ok(allowed.headers['access-control-allow-methods'].includes('PATCH'));assert.ok(allowed.headers['access-control-allow-methods'].includes('PUT'));assert.ok(allowed.headers['access-control-allow-methods'].includes('DELETE'));
  const denied=await request('https://untrusted.example');assert.equal(denied.headers['access-control-allow-origin'],undefined);
 }finally{await app.close();await db.close();}
});
test('CloudPanel trusts client IP headers only from the configured loopback proxy',async()=>{
 const previous=process.env.TRUST_PROXY;process.env.TRUST_PROXY='loopback';
 const db=await openDatabase({path:':memory:',url:null});let app;
 try{
  app=await buildApp({db});
  const login=(remoteAddress,forwarded)=>app.inject({method:'POST',url:'/api/auth/login',remoteAddress,headers:{'x-forwarded-for':forwarded},payload:{email:'unknown@example.test',password:'invalid'}});
  for(let i=0;i<10;i++)assert.equal((await login('127.0.0.1','192.0.2.10')).statusCode,401);
  assert.equal((await login('127.0.0.1','192.0.2.10')).statusCode,429);
  assert.equal((await login('127.0.0.1','192.0.2.11')).statusCode,401);
  for(let i=0;i<10;i++)assert.equal((await login('198.51.100.5',`192.0.2.${30+i}`)).statusCode,401);
  assert.equal((await login('198.51.100.5','192.0.2.90')).statusCode,429);
 }finally{if(app)await app.close();await db.close();if(previous===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=previous;}
});
