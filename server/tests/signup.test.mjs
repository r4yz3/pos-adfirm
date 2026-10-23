import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {checkIntegrity} from '../integrity.mjs';

async function setup(options={}){const db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});const app=await buildApp({db,...options});return {db,app};}
const inject=(app,method,url,payload,token)=>app.inject({method,url,payload,headers:token?{authorization:`Bearer ${token}`}:{}});
const account=(extra={})=>({id:randomUUID(),name:'Rosa Reyes',email:'Rosa@Example.com',password:'correct horse battery',businessName:'Rosa Sari-Sari',location:'Quezon City',...extra});

test('owners create an account with a business and first store, and retries resume it',async()=>{
 const {db,app}=await setup();
 try{
  assert.equal((await inject(app,'GET','/api/health')).json().signup,true);
  const input=account();
  const created=await inject(app,'POST','/api/auth/signup',input);assert.equal(created.statusCode,200,created.body);
  const session=created.json();assert.equal(session.user.role,'owner');assert.equal(session.user.email,'rosa@example.com');
  const stores=(await inject(app,'GET','/api/stores',undefined,session.token)).json();
  const list=Array.isArray(stores)?stores:stores.stores;assert.equal(list.length,1);assert.equal(list[0].name,'Main store');assert.equal(list[0].businessName,'Rosa Sari-Sari');assert.equal(list[0].role,'owner');
  const snapshot=await inject(app,'GET',`/api/stores/${list[0].id}/snapshot`,undefined,session.token);assert.equal(snapshot.statusCode,200);assert.equal(snapshot.json().products.length,0);
  const retry=await inject(app,'POST','/api/auth/signup',input);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().user.id,session.user.id);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM businesses WHERE name=?',['Rosa Sari-Sari'])).n),1);
  const duplicate=await inject(app,'POST','/api/auth/signup',account({email:'rosa@example.com'}));assert.equal(duplicate.statusCode,409);assert.match(duplicate.json().error,/already exists/);
  assert.equal((await inject(app,'POST','/api/auth/signup',account({email:'bot@example.com',website:'spam'}))).statusCode,400);
  assert.equal((await inject(app,'POST','/api/auth/signup',account({email:'short@example.com',password:'too-short'}))).statusCode,400);
  assert.equal((await inject(app,'POST','/api/auth/signup',account({email:'limit@example.com'}))).statusCode,429);
  const elsewhere=await app.inject({method:'POST',url:'/api/auth/signup',payload:account({email:'other@example.com'}),headers:{'cf-connecting-ip':'203.0.113.9'}});assert.equal(elsewhere.statusCode,200,elsewhere.body);
  assert.equal((await inject(app,'POST','/api/auth/login',{email:'rosa@example.com',password:input.password})).statusCode,200);
  assert.equal((await checkIntegrity(db)).ok,true);
 }finally{await app.close();await db.close();}
});

test('sign-up can be closed by configuration',async()=>{
 const {db,app}=await setup({signup:false});
 try{
  assert.equal((await inject(app,'GET','/api/health')).json().signup,false);
  const closed=await inject(app,'POST','/api/auth/signup',account());assert.equal(closed.statusCode,403);
  assert.equal(await db.get('SELECT id FROM users WHERE email=?',['rosa@example.com']),undefined);
 }finally{await app.close();await db.close();}
});
