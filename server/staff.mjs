import {id,passwordHash,passwordMatches,HttpError,audit,now} from './domain.mjs';

export async function listStaff(db,storeId){
 const store=await db.get('SELECT business_id FROM stores WHERE id=?',[storeId]);
 return db.all('SELECT u.id,u.name,u.email,CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS enabled FROM staff_accounts a JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=u.id AND m.store_id=? WHERE a.business_id=? AND u.role=? ORDER BY u.name',[storeId,store.business_id,'cashier']);
}
export async function createStaff(db,user,storeId,input){
 // Hash before taking the database write lock.
 const password=passwordHash(input.password);
 return db.tx(async tx=>{
   if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[storeId]);
   if(await tx.get('SELECT id FROM users WHERE email=?',[input.email]))throw new HttpError(409,'Email already registered. Use another email.');
   const store=await tx.get('SELECT business_id FROM stores WHERE id=?',[storeId]),uid=id();
   await tx.run('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)',[uid,input.email,input.name,password,'cashier']);
   await tx.run('INSERT INTO staff_accounts(user_id,business_id) VALUES(?,?)',[uid,store.business_id]);
   await tx.run('INSERT INTO memberships(user_id,store_id,role) VALUES(?,?,?)',[uid,storeId,'cashier']);
   await audit(tx,user.id,'staff.created',storeId,{userId:uid});return {id:uid};
 });
}
export async function setStaffAccess(db,user,storeId,staffId,enabled){return db.tx(async tx=>{
 if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[storeId]);
 const staff=await tx.get('SELECT u.id FROM users u JOIN staff_accounts a ON a.user_id=u.id JOIN stores s ON s.business_id=a.business_id WHERE u.id=? AND s.id=? AND u.role=?',[staffId,storeId,'cashier']);
 if(!staff)throw new HttpError(404,'Cashier not found in this business');
 const existing=await tx.get('SELECT role FROM memberships WHERE user_id=? AND store_id=?',[staffId,storeId]);
 if(existing&&existing.role!=='cashier')throw new HttpError(409,'This account has a protected role');
 if(enabled&&!existing)await tx.run('INSERT INTO memberships(user_id,store_id,role) VALUES(?,?,?)',[staffId,storeId,'cashier']);
 if(!enabled&&existing)await tx.run('DELETE FROM memberships WHERE user_id=? AND store_id=?',[staffId,storeId]);
 if(Boolean(existing)!==enabled)await audit(tx,user.id,enabled?'staff.enabled':'staff.disabled',storeId,{userId:staffId});
 return {ok:true};
});}

export async function resetStaffPassword(db,user,storeId,staffId,input,sessionHash){return db.tx(async tx=>{
 const owner=await tx.get(`SELECT * FROM users WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`,[user.id]);
 if(!await tx.get('SELECT token_hash FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?',[sessionHash,user.id,now()]))throw new HttpError(401,'Session expired. Sign in again');
 if(!passwordMatches(input.currentPassword,owner.password_hash))throw new HttpError(400,'Owner password is incorrect');
 const target=await tx.get("SELECT u.id FROM users u JOIN staff_accounts a ON a.user_id=u.id JOIN stores s ON s.business_id=a.business_id WHERE s.id=? AND u.id=? AND u.role='cashier'",[storeId,staffId]);
 if(!target)throw new HttpError(404,'Cashier not found');
 const unowned=await tx.get("SELECT m.store_id FROM memberships m WHERE m.user_id=? AND NOT EXISTS(SELECT 1 FROM memberships own WHERE own.store_id=m.store_id AND own.user_id=? AND own.role='owner') LIMIT 1",[staffId,user.id]);
 if(unowned)throw new HttpError(403,'You must own every assigned branch to reset this cashier');
 if(db.kind==='postgres')await tx.get('SELECT id FROM users WHERE id=? FOR UPDATE',[staffId]);
 await tx.run('UPDATE users SET password_hash=? WHERE id=?',[passwordHash(input.newPassword),staffId]);await tx.run('DELETE FROM sessions WHERE user_id=?',[staffId]);await audit(tx,user.id,'staff.password_reset',storeId,{userId:staffId});return {ok:true};
});}
