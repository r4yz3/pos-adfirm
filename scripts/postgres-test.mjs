import pg from 'pg';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.mjs';
import {seed} from '../server/seed.mjs';
import {buildApp} from '../server/app.mjs';
import {checkIntegrity} from '../server/integrity.mjs';
if(!process.env.TEST_DATABASE_URL){console.log('SKIP: TEST_DATABASE_URL is not configured. PostgreSQL verification is still required before a cloud launch.');process.exit(0);}
const schema='adfirm_test_'+randomUUID().replaceAll('-','');assert.match(schema,/^adfirm_test_[a-f0-9]+$/);const control=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});let db,app;
try{await control.query(`CREATE SCHEMA ${schema}`);const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);db=await openDatabase({url:url.toString()});await seed(db,{demo:true});app=await buildApp({db,demo:true});const token=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{role:'owner'}})).json().token;
 const request=(method,path,payload)=>app.inject({method,url:'/api/stores/store-main'+path,payload,headers:{authorization:`Bearer ${token}`}});const created=await request('POST','/products',{id:randomUUID(),name:'Concurrent test',category:'Other',unit:'pc',priceMinor:200,costMinor:101,stock:12,lowStock:0});assert.equal(created.statusCode,200);const product=created.json().product;
 const input=()=>({id:randomUUID(),lines:[{productId:product.id,quantity:1,priceMinor:200}],paymentMethod:'cash',cashMinor:200});const results=await Promise.all(Array.from({length:10},()=>request('POST','/sales',input())));assert.ok(results.every(r=>r.statusCode===200));
 const repeated=input();const retries=await Promise.all(Array.from({length:10},()=>request('POST','/sales',repeated)));assert.ok(retries.every(r=>r.statusCode===200));assert.equal((await db.get('SELECT COUNT(*) AS n FROM sales WHERE id=?',[repeated.id])).n,1);
 const stock=await db.get('SELECT stock_milli,stock_value_minor FROM products WHERE id=?',[product.id]);assert.equal(stock.stock_milli,1000);assert.equal(stock.stock_value_minor,101);
 const branches=await request('GET','/branches');assert.equal(branches.statusCode,200);assert.equal((await checkIntegrity(db)).ok,true);console.log('PASS: PostgreSQL schema, concurrent sales, duplicate delivery, stock valuation, branch reports, and accounting integrity.');
}finally{if(app)await app.close();if(db)await db.close();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();}
