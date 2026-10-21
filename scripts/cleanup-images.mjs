import {existsSync} from 'node:fs';
import {openDatabase} from '../server/database.mjs';
import {imageStorage} from '../server/images.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const apply=process.argv.includes('--apply'),cutoff=new Date(Date.now()-7*86400000).toISOString(),db=await openDatabase();
try{const rows=await db.all('SELECT i.* FROM images i WHERE i.created_at<? AND NOT EXISTS(SELECT 1 FROM products p WHERE p.image_id=i.id)',[cutoff]);console.log(JSON.stringify({mode:apply?'apply':'dry-run',unusedImages:rows.length,bytes:rows.reduce((s,r)=>s+Number(r.bytes),0),minimumAgeDays:7}));if(apply){const storage=imageStorage();for(const row of rows)await db.tx(async tx=>{if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[row.store_id]);if(await tx.get('SELECT id FROM products WHERE image_id=?',[row.id]))return;await storage.remove(row.object_key);await tx.run('DELETE FROM images WHERE id=?',[row.id]);});console.log('Unused images removed.');}}finally{await db.close();}
