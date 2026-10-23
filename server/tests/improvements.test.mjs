import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../database.mjs';
import {seed} from '../seed.mjs';
import {buildApp} from '../app.mjs';
import {checkIntegrity} from '../integrity.mjs';
import {businessDay} from '../finance.mjs';
let db,app,owner,cashier,admin;
const root='/api/stores/store-main';
async function call(method,path,body,token=owner){const r=await app.inject({method,url:path.startsWith('/api/')?path:root+path,payload:body,headers:{authorization:`Bearer ${token}`}});return {status:r.statusCode,body:r.json()};}
async function product(name,extra={}){const r=await call('POST','/products',{id:randomUUID(),name,category:'Other',unit:'pc',priceMinor:200,costMinor:100,stock:10,lowStock:1,...extra});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.product;}
const sale=(p,extra={})=>({id:randomUUID(),lines:[{productId:p.id,quantity:3,priceMinor:p.priceMinor}],paymentMethod:'cash',cashMinor:100000,...extra});
before(async()=>{db=await openDatabase({path:':memory:',url:null});await seed(db,{demo:true});app=await buildApp({db,demo:true});owner=(await call('POST','/api/auth/demo',{role:'owner'},'')).body.token;cashier=(await call('POST','/api/auth/demo',{role:'cashier'},'')).body.token;admin=(await call('POST','/api/auth/demo',{role:'superadmin'},'')).body.token;});
after(async()=>{await app.close();await db.close();});
test('full product edits are atomic, audited, version checked and retry safe',async()=>{
 const p=await product('Editable product',{stock:3});const image=randomUUID();await db.run('INSERT INTO images VALUES(?,?,?,?,?,?,?)',[image,'store-main','test.webp',10,10,10,new Date().toISOString()]);
 const edit={id:randomUUID(),name:'Updated product',barcode:'123456789012',category:'Essentials',unit:'pc',priceMinor:350,costMinor:200,stock:5,lowStock:2,imageId:image,reason:'Correct stock and cost',expectedUpdatedAt:p.updatedAt};
 assert.equal((await call('PATCH',`/products/${p.id}`,edit,cashier)).status,403);
 const result=await call('PATCH',`/products/${p.id}`,edit);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.product.barcode,'0123456789012');assert.equal(result.body.product.imageId,image);assert.equal(result.body.product.category,'Essentials');assert.equal((await call('PATCH',`/products/${p.id}`,edit)).status,200);
 assert.equal((await db.get('SELECT stock_value_minor FROM products WHERE id=?',[p.id])).stock_value_minor,1000);assert.equal((await db.get('SELECT COUNT(*) AS n FROM stock_movements WHERE source_id=?',[edit.id])).n,1);
 assert.equal((await call('PATCH',`/products/${p.id}`,{...edit,id:randomUUID(),expectedUpdatedAt:'2020-01-01T00:00:00.000Z'})).status,409);
 assert.equal((await call('PATCH',`/products/${p.id}`,{costMinor:300})).status,400);
 assert.equal((await call('PATCH',`/products/${p.id}`,{unit:'kg'})).status,409);
 const negative=await product('Oversold metadata',{stock:0});assert.equal((await call('POST','/sales',sale(negative))).status,200);assert.equal((await call('PATCH',`/products/${negative.id}`,{name:'Oversold renamed',stock:-3,costMinor:100})).status,200);assert.equal((await call('PATCH',`/products/${negative.id}`,{stock:-2,reason:'Invalid count'})).status,400);
 assert.equal((await checkIntegrity(db)).ok,true);
});
test('barcode equivalents are unique and images cannot cross stores',async()=>{
 const p=await product('UPC product',{barcode:'234567890123'});assert.equal((await call('POST','/products',{id:randomUUID(),name:'Duplicate code',barcode:'0234567890123',category:'Other',unit:'pc',priceMinor:200,costMinor:0,stock:0,lowStock:0})).status,409);
 const foreign=randomUUID();await db.run('INSERT INTO images VALUES(?,?,?,?,?,?,?)',[foreign,'store-market','other.webp',10,10,10,new Date().toISOString()]);assert.equal((await call('PATCH',`/products/${p.id}`,{imageId:foreign})).status,404);
 const empty=await product('Empty product',{stock:0});assert.equal((await call('PATCH',`/products/${empty.id}`,{unit:'kg',imageId:null})).status,200);
});
test('owner removes and restores a product without losing sale history',async()=>{
 const p=await product('Removable product',{barcode:'987654321098',stock:2});
 const saleResult=await call('POST','/sales',sale(p,{lines:[{productId:p.id,quantity:1,priceMinor:p.priceMinor}]}));assert.equal(saleResult.status,200);
 const current=await db.get('SELECT updated_at FROM products WHERE id=?',[p.id]);
 const blocked=await call('DELETE',`/products/${p.id}`,{id:randomUUID(),expectedUpdatedAt:current.updated_at});assert.equal(blocked.status,409);
 const input={id:randomUUID(),expectedUpdatedAt:current.updated_at,writeOff:true};
 assert.equal((await call('DELETE',`/products/${p.id}`,input,cashier)).status,403);
 assert.equal((await call('DELETE',`/api/stores/store-market/products/${p.id}`,input)).status,404);
 const removed=await call('DELETE',`/products/${p.id}`,input);assert.equal(removed.status,200,JSON.stringify(removed.body));assert.ok(removed.body.product.archivedAt);assert.equal(removed.body.product.stock,0);assert.equal(removed.body.product.barcode,null);assert.equal(removed.body.product.archivedBarcode,'0987654321098');
 assert.equal((await call('DELETE',`/products/${p.id}`,input)).status,200);
 assert.equal((await db.get('SELECT COUNT(*) AS n FROM stock_movements WHERE source_id=?',[input.id])).n,1);
 assert.equal((await checkIntegrity(db)).ok,true);
 assert.ok(!(await call('GET','/snapshot')).body.products.some(row=>row.id===p.id));
 assert.ok((await call('GET','/products/removed')).body.products.some(row=>row.id===p.id));
 assert.equal((await call('GET','/products/removed',undefined,cashier)).status,403);
 assert.equal((await call('POST','/sales',sale(p))).status,400);
 assert.equal((await call('POST',`/products/${p.id}/restock`,{id:randomUUID(),quantity:1,unitCostMinor:100,paymentMethod:'cash'})).status,404);
 assert.equal((await call('PATCH',`/products/${p.id}`,{name:'Should not edit'})).status,404);
 assert.equal((await call('GET',`/sales/${saleResult.body.id}`)).status,200);
 const metrics=await call('GET',`/insights?from=${businessDay()}&to=${businessDay()}`);assert.ok(metrics.body.products.some(row=>row.id===p.id&&row.soldQuantity===1));
 const restored=await call('POST',`/products/${p.id}/restore`,{id:randomUUID(),expectedUpdatedAt:removed.body.product.updatedAt});assert.equal(restored.status,200);assert.equal(restored.body.product.archivedAt,null);assert.equal(restored.body.product.barcode,'0987654321098');assert.equal(restored.body.barcodeCleared,false);
 assert.ok((await call('GET','/snapshot')).body.products.some(row=>row.id===p.id));
 const again=await call('DELETE',`/products/${p.id}`,{id:randomUUID(),expectedUpdatedAt:restored.body.product.updatedAt});assert.equal(again.status,200,JSON.stringify(again.body));
 const replacement=await call('POST','/products',{id:randomUUID(),name:'Replacement product',barcode:'987654321098',category:'Other',unit:'pc',priceMinor:200,costMinor:100,stock:0,lowStock:0});assert.equal(replacement.status,200,JSON.stringify(replacement.body));
 const cleared=await call('POST',`/products/${p.id}/restore`,{id:randomUUID(),expectedUpdatedAt:again.body.product.updatedAt});assert.equal(cleared.status,200);assert.equal(cleared.body.product.barcode,null);assert.equal(cleared.body.barcodeCleared,true);
 assert.equal((await checkIntegrity(db)).ok,true);
});
test('owners create isolated businesses in-app with exactly-once retries',async()=>{
 const input={id:randomUUID(),businessName:'Owner second business',storeName:'First store',location:'Pasig'};
 assert.equal((await call('POST','/api/businesses',input,cashier)).status,403);assert.equal((await call('POST','/api/businesses',input,admin)).status,403);
 const r=await call('POST','/api/businesses',input);assert.equal(r.status,200);assert.equal((await call('POST','/api/businesses',input)).body.storeId,r.body.storeId);assert.equal((await call('POST','/api/businesses',{...input,storeName:'Changed'})).status,409);
 assert.equal((await call('GET',`/api/stores/${r.body.storeId}/snapshot`)).body.products.length,0);assert.equal((await call('GET',`/api/stores/${r.body.storeId}/snapshot`,undefined,cashier)).status,403);
});
test('product metrics use exact sales allocations and subtract partial returns',async()=>{
 const p=await product('Metrics product');const s=(await call('POST','/sales',sale(p))).body,line=(await call('GET',`/sales/${s.id}`)).body.lines[0];
 assert.equal((await call('POST',`/sales/${s.id}/returns`,{id:randomUUID(),lines:[{lineId:line.id,quantity:1}],reason:'Item return',restock:true,creditCancelMinor:0,refundMethod:'cash'})).status,200);
 const r=await call('GET',`/insights?from=${businessDay()}&to=${businessDay()}`),row=r.body.products.find(r=>r.id===p.id);assert.equal(r.status,200);assert.equal(row.soldQuantity,3);assert.equal(row.returnedQuantity,1);assert.equal(row.netQuantity,2);assert.equal(row.revenueMinor,400);assert.equal(row.grossProfitMinor,200);assert.ok(r.body.daily.some(d=>d.day===businessDay()));assert.equal((await call('GET','/insights',undefined,cashier)).status,403);assert.equal((await call('GET','/insights?from=2020-01-01&to=2026-01-01')).status,400);
});
test('utang history lists charges, collections and debt cancellation without crossing stores',async()=>{
 const p=await product('Credit product'),c=(await db.get("SELECT * FROM customers WHERE store_id='store-main' LIMIT 1")),s=(await call('POST','/sales',sale(p,{paymentMethod:'credit',cashMinor:0,customerId:c.id}))).body;
 assert.equal((await call('POST',`/customers/${c.id}/collections`,{id:randomUUID(),amountMinor:100})).status,200);
 const line=(await call('GET',`/sales/${s.id}`)).body.lines[0];await call('POST',`/sales/${s.id}/returns`,{id:randomUUID(),lines:[{lineId:line.id,quantity:1}],reason:'Credit item return',restock:true,creditCancelMinor:200,refundMethod:'cash'});
 const r=await call('GET',`/customers/${c.id}/statement`);assert.equal(r.status,200);assert.equal(r.body.customer.balanceMinor,c.balance_minor+300);assert.deepEqual(r.body.events.map(e=>e.type).sort(),['Payment','Return','Utang']);assert.equal((await call('GET',`/api/stores/store-market/customers/${c.id}/statement`)).status,404);assert.equal((await call('GET',`/customers/${c.id}/statement`,undefined,cashier)).status,403);
});
test('registered installations are deduplicated and require store membership',async()=>{
 const b={installationId:randomUUID(),platform:'android',version:'0.3.0',storeId:'store-main'};assert.equal((await call('POST','/api/installations',b)).status,200);assert.equal((await call('POST','/api/installations',b)).status,200);assert.equal((await call('POST','/api/installations',{...b,storeId:'missing'})).status,403);
 const r=await call('GET','/api/admin/tracking',undefined,admin);assert.equal(r.body.metrics.registeredAndroid,1);assert.equal(r.body.metrics.activeAndroid,1);assert.equal(r.body.devices.length,1);assert.equal((await call('GET','/api/admin/tracking')).status,403);
});
test('admin subscription records expire, stay separate from billing and never permit cashier access',async()=>{
 const body={status:'active',periodEndsAt:new Date(Date.now()+86400000).toISOString(),reference:'Manual receipt',note:'Recorded enrollment'};
 assert.equal((await call('PUT',root+'/subscription',body)).status,404);
 assert.equal((await call('PUT','/api/admin/stores/store-main/subscription',body)).status,403);
 assert.equal((await call('PUT','/api/admin/stores/store-main/subscription',{...body,periodEndsAt:null},admin)).status,400);
 assert.equal((await call('PUT','/api/admin/stores/store-main/subscription',body,admin)).status,200);let r=(await call('GET','/api/admin/tracking',undefined,admin)).body;assert.equal(r.metrics.subscribed,1);
 await db.run("UPDATE store_subscriptions SET period_ends_at='2020-01-01T00:00:00.000Z' WHERE store_id='store-main'");r=(await call('GET','/api/admin/tracking',undefined,admin)).body;assert.equal(r.metrics.subscribed,0);assert.equal(r.metrics.expired,1);assert.equal((await call('GET','/snapshot')).body.billing.mode,'free');
});
test('admin access controls, printer workflow, account privacy and audit pagination work',async()=>{
 assert.equal((await call('PUT','/api/admin/stores/store-main/access',{salesEnabled:false,reason:'Support review'},admin)).status,200);assert.equal((await call('GET','/snapshot')).body.salesEnabled,false);await call('PUT','/api/admin/stores/store-main/access',{salesEnabled:true,reason:'Review complete'},admin);
 const inquiry=(await call('POST','/hardware-orders',{id:randomUUID()})).body;assert.equal((await call('PUT',`/api/admin/hardware-orders/${inquiry.id}`,{status:'quoted',note:'Quote prepared'},admin)).status,200);
 const accounts=(await call('GET','/api/admin/accounts',undefined,admin)).body.users;assert.ok(accounts.length>=3);assert.ok(accounts.every(u=>!('password_hash'in u)));
 const at=new Date().toISOString();await db.tx(async tx=>{for(let i=0;i<105;i++)await tx.run('INSERT INTO audit_events VALUES(?,?,?,?,?,?)',[randomUUID(),'owner-demo','test.activity','store-main','{}',at]);});
 const a=(await call('GET','/api/admin/audit',undefined,admin)).body,last=a.events.at(-1),b=(await call('GET',`/api/admin/audit?before=${encodeURIComponent(last.createdAt)}&beforeId=${last.id}`,undefined,admin)).body;assert.equal(a.events.length,100);assert.equal(a.hasMore,true);assert.ok(b.events.length>0);assert.ok(!a.events.some(e=>b.events.some(x=>x.id===e.id)));
});
