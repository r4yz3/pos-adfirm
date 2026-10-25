import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {checkIntegrity} from '../integrity.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('adding stock outside a purchase is owner capital, losing stock is a loss',async()=>{
 const db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});const app=await buildApp({db,demo:true});
 const token=(await app.inject({method:'POST',url:'/api/auth/demo',payload:{role:'owner'}})).json().token;
 const call=async(method,url,payload)=>{const r=await app.inject({method,url:`/api/stores/store-main${url}`,payload,headers:{authorization:`Bearer ${token}`}});return {status:r.statusCode,body:r.json()};};
 const profit=async()=>(await call('GET','/snapshot')).body.dashboard;
 try{
  const before=await profit();
  const p=(await call('POST','/products',{id:randomUUID(),name:'Setup item',category:'Other',unit:'pc',priceMinor:5000,costMinor:2000,stock:0,lowStock:1})).body.product;
  // Setting up stock on an existing product: value rises by 10 × ₱20 = ₱200, profit must not.
  const added=await call('PATCH',`/products/${p.id}`,{id:randomUUID(),stock:10,reason:'Opening stock on hand',expectedUpdatedAt:p.updatedAt});assert.equal(added.status,200,JSON.stringify(added.body));
  let d=await profit();assert.equal(d.profitMinor,before.profitMinor);assert.equal(d.adjustmentMinor,before.adjustmentMinor);
  // A count that finds extra stock is also not income.
  assert.equal((await call('POST',`/products/${p.id}/count`,{id:randomUUID(),quantity:12,reason:'Stock count'})).status,200);
  d=await profit();assert.equal(d.profitMinor,before.profitMinor);
  // Three damaged units (₱60) are a loss.
  assert.equal((await call('POST',`/products/${p.id}/count`,{id:randomUUID(),quantity:9,reason:'Damaged'})).status,200);
  d=await profit();assert.equal(d.adjustmentMinor,before.adjustmentMinor-6000);assert.equal(d.profitMinor,before.profitMinor-6000);
  assert.equal((await checkIntegrity(db)).ok,true);
 }finally{await app.close();await db.close();}
});

test('stock increases booked as profit before this rule move to owner capital on start',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'adfirm-ledger-')),path=join(dir,'pos.sqlite');
 try{
  let db=await openDatabase({path,url:null});await seed(db,{demo:true});
  const at=new Date().toISOString();
  await db.run('INSERT INTO journals(id,store_id,source_type,source_id,account,debit_minor,credit_minor,created_at) VALUES(?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?)',[randomUUID(),'store-main','product_adjustment','old-gain','inventory',777,0,at,randomUUID(),'store-main','product_adjustment','old-gain','inventory_adjustment',0,777,at,randomUUID(),'store-main','stock_count','old-loss','inventory_adjustment',300,0,at,randomUUID(),'store-main','stock_count','old-loss','inventory',0,300,at]);
  await db.close();db=await openDatabase({path,url:null});
  const rows=await db.all("SELECT source_id,account,debit_minor,credit_minor FROM journals WHERE source_id IN ('old-gain','old-loss') ORDER BY source_id,account");
  assert.deepEqual(rows.map(r=>[r.source_id,r.account,Number(r.debit_minor),Number(r.credit_minor)]),[['old-gain','equity',0,777],['old-gain','inventory',777,0],['old-loss','inventory',0,300],['old-loss','inventory_adjustment',300,0]]);
  await db.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
