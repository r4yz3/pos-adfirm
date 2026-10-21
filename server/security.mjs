import {now,hash,passwordHash,passwordMatches,HttpError,audit} from './domain.mjs';

export async function secureAccount(db,user,token,input,{changePassword=false}={}){
 return db.tx(async tx=>{
  const current=await tx.get(`SELECT * FROM users WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`,[user.id]);
  const session=await tx.get('SELECT token_hash FROM sessions WHERE token_hash=? AND user_id=? AND expires_at>?',[hash(token),user.id,now()]);
  if(!session)throw new HttpError(401,'Session expired. Sign in again');
  if(!passwordMatches(input.currentPassword,current.password_hash))throw new HttpError(400,'Current password is incorrect');
  if(changePassword&&passwordMatches(input.newPassword,current.password_hash))throw new HttpError(400,'Choose a different new password');
  const others=await tx.get('SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND token_hash<>? AND expires_at>?',[user.id,hash(token),now()]);
  if(changePassword)await tx.run('UPDATE users SET password_hash=? WHERE id=?',[passwordHash(input.newPassword),user.id]);
  await tx.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',[user.id,hash(token)]);
  await audit(tx,user.id,changePassword?'account.password_changed':'account.sessions_revoked',null,{revokedSessions:Number(others.count)});
  return {ok:true,revokedSessions:Number(others.count)};
 });
}
