import {z} from 'zod';
import {HttpError,id,now,hash,audit} from './domain.mjs';
export function subscriptionStatus(row){return row?.status==='active'&&(!row.period_ends_at||row.period_ends_at<=now())?'expired':row?.status||'free';}
export async function platformTracking(db){
 const rows=await db.all('SELECT * FROM store_subscriptions'),storeCount=Number((await db.get('SELECT COUNT(*) AS n FROM stores')).n),active=rows.filter(r=>subscriptionStatus(r)==='active').length;
 const week=new Date(Date.now()-7*86400000).toISOString();
 const installs=await db.all('SELECT platform,COUNT(*) AS n FROM installations GROUP BY platform');
 return {registeredAndroid:Number(installs.find(i=>i.platform==='android')?.n||0),webDevices:Number(installs.find(i=>i.platform==='web')?.n||0),activeAndroid:Number((await db.get("SELECT COUNT(*) AS n FROM installations WHERE platform='android' AND last_seen>=?",[week])).n),subscribed:active,notSubscribed:storeCount-active,trial:rows.filter(r=>subscriptionStatus(r)==='trial').length,expired:rows.filter(r=>subscriptionStatus(r)==='expired').length,owners:Number((await db.get("SELECT COUNT(*) AS n FROM users WHERE role='owner'")).n),cashiers:Number((await db.get("SELECT COUNT(*) AS n FROM users WHERE role='cashier'")).n),transactions:Number((await db.get('SELECT COUNT(*) AS n FROM sales')).n)};
}
export function registerPlatformRoutes(app,{db,auth,admin}){
 app.post('/api/installations',{preHandler:auth,config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async req=>{
  const b=z.object({installationId:z.uuid(),platform:z.enum(['android','web']),version:z.string().trim().min(1).max(30),storeId:z.string().optional()}).parse(req.body);
  if(b.storeId&&!await db.get('SELECT user_id FROM memberships WHERE user_id=? AND store_id=?',[req.user.id,b.storeId]))throw new HttpError(403,'Store access required');
  const key=hash(b.installationId),at=now();
  await db.tx(tx=>tx.run('INSERT INTO installations(id,user_id,store_id,platform,app_version,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,store_id=excluded.store_id,platform=excluded.platform,app_version=excluded.app_version,last_seen=excluded.last_seen',[key,req.user.id,b.storeId||null,b.platform,b.version,at,at]));return {ok:true};
 });
 app.post('/api/businesses',{preHandler:auth,config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>{
  if(req.user.role!=='owner')throw new HttpError(403,'Owner access required');
  const b=z.object({id:z.uuid(),businessName:z.string().trim().min(2).max(100),storeName:z.string().trim().min(2).max(100),location:z.string().trim().max(150).default('')}).parse(req.body);
  return db.tx(async tx=>{
   const user=await tx.get(`SELECT role FROM users WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`,[req.user.id]);if(user?.role!=='owner')throw new HttpError(403,'Owner access required');
   const digest=hash(JSON.stringify({kind:'owner.business.create',userId:req.user.id,input:b})),old=await tx.get('SELECT * FROM financial_commands WHERE id=?',[b.id]);if(old){if(old.request_hash!==digest)throw new HttpError(409,'Request ID already used');return JSON.parse(old.result);}
   await tx.run('INSERT INTO businesses(id,name) VALUES(?,?)',[b.id,b.businessName]);await tx.run('INSERT INTO stores(id,business_id,name,location) VALUES(?,?,?,?)',[b.id,b.id,b.storeName,b.location]);await tx.run("INSERT INTO memberships(user_id,store_id,role) VALUES(?,?,'owner')",[req.user.id,b.id]);
   const result={businessId:b.id,storeId:b.id};await tx.run('INSERT INTO financial_commands VALUES(?,?,?,?,?)',[b.id,b.id,digest,JSON.stringify(result),now()]);await audit(tx,req.user.id,'business.created',b.id,{businessId:b.id,selfService:true});return result;
  });
 });
 app.get('/api/admin/tracking',{preHandler:admin},async()=>{
  const stores=await db.all("SELECT s.id,s.name,s.location,b.name AS business_name,COALESCE(x.sales_enabled,1) AS enabled,p.status,p.period_ends_at,p.reference,p.note,p.updated_at,(SELECT COUNT(*) FROM sales a WHERE a.store_id=s.id) AS sale_count,(SELECT MAX(created_at) FROM sales a WHERE a.store_id=s.id) AS last_sale,(SELECT COUNT(*) FROM memberships m WHERE m.store_id=s.id) AS staff_count FROM stores s JOIN businesses b ON b.id=s.business_id LEFT JOIN store_settings x ON x.store_id=s.id LEFT JOIN store_subscriptions p ON p.store_id=s.id ORDER BY b.name,s.name");
  const devices=await db.all('SELECT i.platform,i.app_version AS version,i.first_seen AS "firstSeen",i.last_seen AS "lastSeen",u.name AS "userName",s.name AS "storeName" FROM installations i JOIN users u ON u.id=i.user_id LEFT JOIN stores s ON s.id=i.store_id ORDER BY i.last_seen DESC LIMIT 100');
  return {metrics:await platformTracking(db),stores:stores.map(s=>({id:s.id,name:s.name,businessName:s.business_name,location:s.location,salesEnabled:Number(s.enabled)!==0,status:subscriptionStatus(s),periodEndsAt:s.period_ends_at,reference:s.reference||'',note:s.note||'',saleCount:Number(s.sale_count),lastSale:s.last_sale,staffCount:Number(s.staff_count)})),devices};
 });
 app.put('/api/admin/stores/:storeId/subscription',{preHandler:admin},async req=>{
  const b=z.object({status:z.enum(['free','trial','active','past_due','cancelled']),periodEndsAt:z.iso.datetime().nullable().default(null),reference:z.string().trim().max(100).default(''),note:z.string().trim().min(3).max(300)}).parse(req.body);
  if(b.status==='active'&&(!b.periodEndsAt||b.periodEndsAt<=now()))throw new HttpError(400,'Active subscriptions need a future end date');
  return db.tx(async tx=>{if(!await tx.get('SELECT id FROM stores WHERE id=?',[req.params.storeId]))throw new HttpError(404,'Store not found');await tx.run('INSERT INTO store_subscriptions VALUES(?,?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET status=excluded.status,period_ends_at=excluded.period_ends_at,reference=excluded.reference,note=excluded.note,updated_at=excluded.updated_at',[req.params.storeId,b.status,b.periodEndsAt,b.reference,b.note,now()]);await audit(tx,req.user.id,'subscription.recorded',req.params.storeId,b);return {ok:true};});
 });
 app.put('/api/admin/stores/:storeId/access',{preHandler:admin},async req=>{
  const b=z.object({salesEnabled:z.boolean(),reason:z.string().trim().min(3).max(200)}).parse(req.body);return db.tx(async tx=>{if(!await tx.get('SELECT id FROM stores WHERE id=?',[req.params.storeId]))throw new HttpError(404,'Store not found');if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[req.params.storeId]);await tx.run('INSERT INTO store_settings(store_id,sales_enabled) VALUES(?,?) ON CONFLICT(store_id) DO UPDATE SET sales_enabled=excluded.sales_enabled',[req.params.storeId,b.salesEnabled?1:0]);await audit(tx,req.user.id,'store.access_updated',req.params.storeId,b);return {ok:true};});
 });
 app.put('/api/admin/hardware-orders/:orderId',{preHandler:admin},async req=>{
  const b=z.object({status:z.enum(['inquiry','contacted','quoted','closed']),note:z.string().trim().max(200).default('')}).parse(req.body);return db.tx(async tx=>{const row=await tx.get('SELECT store_id FROM hardware_orders WHERE id=?',[req.params.orderId]);if(!row)throw new HttpError(404,'Inquiry not found');await tx.run('UPDATE hardware_orders SET status=? WHERE id=?',[b.status,req.params.orderId]);await audit(tx,req.user.id,'hardware.updated',row.store_id,{orderId:req.params.orderId,...b});return {ok:true};});
 });
 app.get('/api/admin/audit',{preHandler:admin},async req=>{
  const q=z.object({before:z.iso.datetime().optional(),beforeId:z.uuid().optional()}).parse(req.query);if(Boolean(q.before)!==Boolean(q.beforeId))throw new HttpError(400,'Invalid activity cursor');
  const values=q.before?[q.before,q.before,q.beforeId]:[],where=q.before?'WHERE (a.created_at<? OR (a.created_at=? AND a.id<?))':'';
  const rows=await db.all(`SELECT a.id,a.action,a.created_at AS "createdAt",a.details,u.name AS "userName",s.name AS "storeName" FROM audit_events a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN stores s ON s.id=a.store_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 101`,values);
  return {events:rows.slice(0,100),hasMore:rows.length>100};
 });
 app.get('/api/admin/accounts',{preHandler:admin},async()=>({users:await db.all("SELECT u.id,u.name,u.email,u.role,(SELECT COUNT(*) FROM memberships m WHERE m.user_id=u.id) AS stores,(SELECT MAX(expires_at) FROM sessions s WHERE s.user_id=u.id) AS \"sessionExpiresAt\" FROM users u ORDER BY u.role,u.name")}));
}
