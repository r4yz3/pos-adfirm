import {HttpError,audit} from './domain.mjs';
import {command,report,businessDay} from './finance.mjs';

async function ownerBusiness(tx,user,storeId){const row=await tx.get("SELECT s.business_id FROM stores s JOIN memberships m ON m.store_id=s.id WHERE s.id=? AND m.user_id=? AND m.role='owner'",[storeId,user.id]);if(!row)throw new HttpError(403,'Owner access required');return row.business_id;}
export async function createBranch(db,user,storeId,input){return command(db,user,storeId,'branch.create',input,async(tx,key)=>{
 const business=await ownerBusiness(tx,user,storeId);if(db.kind==='postgres')await tx.get('SELECT id FROM businesses WHERE id=? FOR UPDATE',[business]);
 if(await tx.get('SELECT id FROM stores WHERE business_id=? AND LOWER(name)=LOWER(?)',[business,input.name]))throw new HttpError(409,'A branch with this name already exists');
 await tx.run('INSERT INTO stores(id,business_id,name,location) VALUES(?,?,?,?)',[key,business,input.name,input.location]);
 await tx.run('INSERT INTO memberships(user_id,store_id,role) VALUES(?,?,?)',[user.id,key,'owner']);
 await audit(tx,user.id,'branch.created',key,{businessId:business});return {id:key};
});}
export async function updateBranch(db,user,storeId,branchId,input){return db.tx(async tx=>{
 const business=await ownerBusiness(tx,user,storeId);
 const target=await tx.get("SELECT s.id FROM stores s JOIN memberships m ON m.store_id=s.id WHERE s.id=? AND s.business_id=? AND m.user_id=? AND m.role='owner'",[branchId,business,user.id]);if(!target)throw new HttpError(404,'Branch not found');
 if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[branchId]);
 if(db.kind==='postgres')await tx.get('SELECT id FROM businesses WHERE id=? FOR UPDATE',[business]);
 if(await tx.get('SELECT id FROM stores WHERE business_id=? AND LOWER(name)=LOWER(?) AND id<>?',[business,input.name,branchId]))throw new HttpError(409,'A branch with this name already exists');
 await tx.run('UPDATE stores SET name=?,location=? WHERE id=?',[input.name,input.location,branchId]);
 await tx.run('INSERT INTO store_settings(store_id,sales_enabled) VALUES(?,?) ON CONFLICT(store_id) DO UPDATE SET sales_enabled=excluded.sales_enabled',[branchId,input.salesEnabled?1:0]);
 await audit(tx,user.id,'branch.updated',branchId,{name:input.name,location:input.location,salesEnabled:input.salesEnabled});return {ok:true};
});}
export async function branchOverview(db,user,storeId,day=businessDay()){return db.tx(async tx=>{
 if(db.kind==='postgres')await tx.run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 const business=await ownerBusiness(tx,user,storeId),stores=await tx.all("SELECT s.id,s.name,s.location,COALESCE(x.sales_enabled,1) AS enabled FROM stores s JOIN memberships m ON m.store_id=s.id LEFT JOIN store_settings x ON x.store_id=s.id WHERE s.business_id=? AND m.user_id=? AND m.role='owner' ORDER BY s.name",[business,user.id]);
 const branches=[];for(const s of stores){const r=await report(tx,s.id,day,day);branches.push({id:s.id,name:s.name,location:s.location,salesEnabled:Boolean(s.enabled),salesMinor:r.salesMinor,profitMinor:r.profitMinor,cashMinor:r.accounts.find(a=>a.account==='cash')?.balanceMinor||0,utangMinor:r.accounts.find(a=>a.account==='receivables')?.balanceMinor||0});}
 const totals={salesMinor:0,profitMinor:0,cashMinor:0,utangMinor:0};for(const b of branches)for(const k of Object.keys(totals))totals[k]+=b[k];return {day,branches,totals};
});}
