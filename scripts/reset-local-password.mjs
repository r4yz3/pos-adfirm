import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {id,now,passwordHash} from '../server/domain.mjs';
const [database,email]=process.argv.slice(2),password=process.env.ADFIRM_RESET_PASSWORD;
if(!database||!email||!password||password.length<16||password.length>128)throw new Error('Provide the local database, account email, and ADFIRM_RESET_PASSWORD (16–128 characters). Use the PowerShell recovery wrapper.');
const path=resolve(database);if(!existsSync(path))throw new Error('Database not found');const db=new DatabaseSync(path);
try{db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');const user=db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase());if(!user)throw new Error('Account not found');db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('INSERT INTO audit_events(id,user_id,action,store_id,details,created_at) VALUES(?,?,?,?,?,?)').run(id(),'local-operator','account.local_recovery',null,JSON.stringify({userId:user.id}),now());db.exec('COMMIT');console.log('Password reset. All sessions for this account were revoked.');}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
