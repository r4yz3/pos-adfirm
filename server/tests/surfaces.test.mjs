import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';

const password='AdfirmDemo!2026';
const login=(app,email,headers)=>app.inject({method:'POST',url:'/api/auth/login',payload:{email,password},headers});
const health=async(app,headers)=>(await app.inject({method:'GET',url:'/api/health',headers})).json();

test('store POS and platform admin each sign in only on their own web address',async()=>{
 const db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});
 const app=await buildApp({db,adminHosts:'pos.adfirm.net',appHosts:'app.adfirm.net'});
 const admin={host:'pos.adfirm.net'},pos={host:'app.adfirm.net'},android={host:'pos.adfirm.net',origin:'https://localhost'};
 try{
  const adminSide=await health(app,admin);assert.equal(adminSide.surface,'admin');assert.equal(adminSide.signup,false);assert.equal(adminSide.appUrl,'https://app.adfirm.net');
  const posSide=await health(app,pos);assert.equal(posSide.surface,'app');assert.equal(posSide.signup,true);assert.equal(posSide.adminUrl,'https://pos.adfirm.net');
  assert.equal((await health(app,{host:'127.0.0.1:4100'})).surface,'all');
  assert.equal((await login(app,'admin@adfirm.demo',admin)).statusCode,200);
  const ownerOnAdmin=await login(app,'owner@adfirm.demo',admin);assert.equal(ownerOnAdmin.statusCode,403);assert.match(ownerOnAdmin.json().error,/app\.adfirm\.net/);
  assert.equal((await login(app,'cashier@adfirm.demo',admin)).statusCode,403);
  assert.equal((await login(app,'owner@adfirm.demo',pos)).statusCode,200);
  assert.equal((await login(app,'cashier@adfirm.demo',pos)).statusCode,200);
  const adminOnPos=await login(app,'admin@adfirm.demo',pos);assert.equal(adminOnPos.statusCode,403);assert.match(adminOnPos.json().error,/pos\.adfirm\.net/);
  // Installed Android apps still reach the API through the admin address but act as the store POS.
  assert.equal((await health(app,android)).surface,'app');
  assert.equal((await login(app,'owner@adfirm.demo',android)).statusCode,200);
  assert.equal((await login(app,'admin@adfirm.demo',android)).statusCode,403);
  const signup={id:randomUUID(),name:'Lito Cruz',email:'lito@example.com',password:'correct horse battery',businessName:'Lito Store'};
  assert.equal((await app.inject({method:'POST',url:'/api/auth/signup',payload:signup,headers:admin})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/signup',payload:signup,headers:pos})).statusCode,200);
 }finally{await app.close();await db.close();}
});
