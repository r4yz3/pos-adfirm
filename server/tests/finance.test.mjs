import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {businessDay} from '../finance.mjs';
let db,app,owner,cashier,p,customer;
const root='/api/stores/store-main';
async function call(method,path,payload,token=owner){const r=await app.inject({method,url:root+path,headers:{authorization:`Bearer ${token}`},payload});return {status:r.statusCode,body:r.json()};}
async function sale(extra={}){return call('POST','/sales',{id:randomUUID(),lines:[{productId:p.id,quantity:1,priceMinor:p.priceMinor}],paymentMethod:'cash',cashMinor:100000,...extra});}
before(async()=>{db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});app=await buildApp({db,demo:true});for(const role of ['owner','cashier']){const r=await app.inject({method:'POST',url:'/api/auth/demo',payload:{role}});if(role==='owner')owner=r.json().token;else cashier=r.json().token;}const s=(await call('GET','/snapshot')).body;p=s.products[0];customer=s.customers[0];});
after(async()=>{await app.close();await db.close();});
test('expense retries and collections have one financial effect',async()=>{
 const input={id:randomUUID(),category:'Other',note:'Test retry',amountMinor:100,paymentMethod:'cash'};
 const results=await Promise.all([call('POST','/expenses',input),call('POST','/expenses',input)]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].body.id,results[1].body.id);assert.equal((await db.get('SELECT COUNT(*) AS n FROM expenses WHERE id=?',[input.id])).n,1);
 assert.equal((await call('POST','/expenses',{...input,amountMinor:200})).status,409);
 const collection={id:randomUUID(),amountMinor:100},path=`/customers/${customer.id}/collections`;
 const before=await db.get('SELECT balance_minor FROM customers WHERE id=?',[customer.id]);await call('POST',path,collection);await call('POST',path,collection);assert.equal((await db.get('SELECT balance_minor FROM customers WHERE id=?',[customer.id])).balance_minor,before.balance_minor-100);
 assert.equal((await call('POST',path,{...collection,amountMinor:200})).status,409);
});
test('refund reverses revenue today and restores exact cost once',async()=>{
 const yesterday=new Date(Date.now()-86400000).toISOString(),original=await sale({occurredAt:yesterday});assert.equal(original.status,200);
 const previous=(await call('GET','/reports')).body,stock=await db.get('SELECT stock_milli,stock_value_minor FROM products WHERE id=?',[p.id]);
 const input={id:randomUUID(),reason:'Returned unopened',restock:true},path=`/sales/${original.body.id}/refund`;
 assert.equal((await call('POST',path,input,cashier)).status,403);assert.equal((await call('POST',path,input)).status,200);assert.equal((await call('POST',path,input)).status,200);
 assert.equal((await call('POST',path,{...input,id:randomUUID()})).status,409);
 const after=(await call('GET','/reports')).body;assert.equal(after.salesMinor,previous.salesMinor-original.body.totalMinor);assert.equal(after.costMinor,previous.costMinor-original.body.costMinor);assert.equal(after.balanceCheckMinor,0);
 const restored=await db.get('SELECT stock_milli,stock_value_minor FROM products WHERE id=?',[p.id]);assert.equal(restored.stock_milli,stock.stock_milli+1000);assert.equal(restored.stock_value_minor,stock.stock_value_minor+original.body.costMinor);
 const yesterdayDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(yesterday));const past=(await call('GET',`/reports?from=${yesterdayDay}&to=${yesterdayDay}`)).body;assert.equal(past.salesMinor,original.body.totalMinor);
});
test('non-restocked refund keeps product costs and never alters stock',async()=>{const s=(await sale()).body;const before=await db.get('SELECT stock_milli FROM products WHERE id=?',[p.id]);const r=await call('POST',`/sales/${s.id}/refund`,{id:randomUUID(),reason:'Damaged goods',restock:false});assert.equal(r.status,200);assert.equal((await db.get('SELECT stock_milli FROM products WHERE id=?',[p.id])).stock_milli,before.stock_milli);assert.equal((await db.get("SELECT COUNT(*) AS n FROM journals WHERE source_type='refund' AND source_id=? AND account='inventory'",[r.body.id])).n,0);});
test('credit refunds and foreign-store sale refunds are rejected',async()=>{const s=(await sale({paymentMethod:'credit',customerId:customer.id,cashMinor:0})).body;assert.equal((await call('POST',`/sales/${s.id}/refund`,{id:randomUUID(),reason:'Test return',restock:true})).status,400);const r=await app.inject({method:'POST',url:`/api/stores/store-market/sales/${s.id}/refund`,headers:{authorization:`Bearer ${owner}`},payload:{id:randomUUID(),reason:'Test return',restock:true}});assert.equal(r.statusCode,404);});
test('cash closing is idempotent, preserves variance and flags later postings',async()=>{
 const account=(await call('GET','/reports')).body.accounts.find(a=>a.account==='cash');const input={id:randomUUID(),day:businessDay(),countedMinor:account.balanceMinor-100,note:'One peso short'};
 assert.equal((await call('POST','/closings',{...input,note:''})).status,400);assert.equal((await call('POST','/closings',input,cashier)).status,403);
 const r=await call('POST','/closings',input);assert.equal(r.status,200);assert.equal(r.body.varianceMinor,-100);assert.equal((await call('POST','/closings',input)).body.id,r.body.id);assert.equal((await call('POST','/closings',{...input,id:randomUUID()})).status,409);
 assert.equal((await call('GET','/closings')).body.closings[0].lateEntries,false);await sale();const c=(await call('GET','/closings')).body.closings[0];assert.equal(c.lateEntries,true);assert.equal(c.variance_minor,-100);
});
test('reports enforce dates, roles and balanced books',async()=>{assert.equal((await call('GET','/reports?from=2026-02-30&to=2026-03-01')).status,400);assert.equal((await call('GET','/reports?from=2026-10-20&to=2026-10-01')).status,400);assert.equal((await call('GET','/reports',undefined,cashier)).status,403);assert.equal((await call('GET','/reports')).body.balanceCheckMinor,0);const net=await db.get('SELECT SUM(debit_minor-credit_minor) AS balance FROM journals');assert.equal(net.balance,0);});
test('owner capital and drawings change equity and cash without changing profit',async()=>{
 const before=(await call('GET','/reports')).body,input={id:randomUUID(),type:'capital',amountMinor:10000,paymentMethod:'cash',note:'Owner cash contribution'};
 assert.equal((await call('POST','/money-movements',input,cashier)).status,403);assert.equal((await call('POST','/money-movements',input)).status,200);assert.equal((await call('POST','/money-movements',input)).status,200);
 assert.equal((await call('POST','/money-movements',{...input,amountMinor:20000})).status,409);
 const added=(await call('GET','/reports')).body;assert.equal(added.profitMinor,before.profitMinor);assert.equal(added.capitalMinor,before.capitalMinor+10000);assert.equal(added.assetsMinor,before.assetsMinor+10000);
 assert.equal((await call('POST','/money-movements',{...input,id:randomUUID(),type:'drawing',amountMinor:5000,note:'Owner personal withdrawal'})).status,200);
 const after=(await call('GET','/reports')).body;assert.equal(after.capitalMinor,before.capitalMinor+5000);assert.equal(after.profitMinor,before.profitMinor);assert.equal(after.balanceCheckMinor,0);
});
test('cash transfer preserves assets and profit, and rejects insufficient recorded funds',async()=>{
 const before=(await call('GET','/reports')).body,input={id:randomUUID(),type:'transfer',amountMinor:1000,paymentMethod:'cash',note:'Wallet top up'};
 assert.equal((await call('POST','/money-movements',input)).status,200);const after=(await call('GET','/reports')).body;
 assert.equal(after.assetsMinor,before.assetsMinor);assert.equal(after.profitMinor,before.profitMinor);assert.equal(after.accounts.find(a=>a.account==='wallet').balanceMinor,(before.accounts.find(a=>a.account==='wallet')?.balanceMinor||0)+1000);
 assert.equal((await call('POST','/money-movements',{...input,id:randomUUID(),amountMinor:100000000})).status,400);assert.equal(after.balanceCheckMinor,0);
});
test('supplier payment settles debt without expensing stock twice',async()=>{
 assert.equal((await call('POST',`/products/${p.id}/restock`,{quantity:2,unitCostMinor:200,paymentMethod:'supplier'})).status,200);
 const before=(await call('GET','/reports')).body,input={id:randomUUID(),type:'supplier_payment',amountMinor:200,paymentMethod:'cash',note:'Supplier delivery invoice 123'};
 assert.equal((await call('POST','/money-movements',input)).status,200);assert.equal((await call('POST','/money-movements',input)).status,200);
 const after=(await call('GET','/reports')).body;assert.equal(after.liabilitiesMinor,before.liabilitiesMinor-200);assert.equal(after.profitMinor,before.profitMinor);assert.equal(after.assetsMinor,before.assetsMinor-200);assert.equal(after.balanceCheckMinor,0);
 assert.equal((await call('POST','/money-movements',{...input,id:randomUUID(),amountMinor:201})).status,400);assert.equal((await call('GET','/money-movements',undefined,cashier)).status,403);
 const other=await app.inject({method:'GET',url:'/api/stores/store-market/money-movements',headers:{authorization:`Bearer ${owner}`}});assert.equal(other.json().movements.length,0);
});
