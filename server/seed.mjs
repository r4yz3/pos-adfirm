import {z} from 'zod';
import { id, now, passwordHash, journal } from './domain.mjs';
export async function seed(db,{demo=false,adminEmail=process.env.BOOTSTRAP_ADMIN_EMAIL,adminPassword=process.env.BOOTSTRAP_ADMIN_PASSWORD}={}){
  await db.tx(async tx=>{
    if(!await tx.get("SELECT id FROM platform_settings WHERE id='billing'"))await tx.run('INSERT INTO platform_settings VALUES(?,?)',['billing',JSON.stringify({mode:'free',priceMinor:4900,noticeDays:30,graceDays:7,effectiveAt:null})]);
    if(await tx.get('SELECT id FROM users LIMIT 1'))return;
    if(!demo){adminEmail=String(adminEmail||'').trim().toLowerCase();if(!z.email().safeParse(adminEmail).success)throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL');if(!adminEmail||!adminPassword||adminPassword.length<16)throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (16+ characters), or enable local DEMO_MODE');await tx.run('INSERT INTO users VALUES(?,?,?,?,?)',[id(),adminEmail,'Platform owner',passwordHash(adminPassword),'superadmin']);return;}
    const pw=passwordHash('AdfirmDemo!2026');
    for(const [uid,email,name,role]of[['owner-demo','owner@adfirm.demo','Nena Reyes','owner'],['admin-demo','admin@adfirm.demo','Adfirm Admin','superadmin'],['cashier-demo','cashier@adfirm.demo','Mika Santos','cashier']])await tx.run('INSERT INTO users VALUES(?,?,?,?,?)',[uid,email,name,pw,role]);
    await tx.run('INSERT INTO businesses VALUES(?,?)',['business-nena','Aling Nena’s']);
    await tx.run('INSERT INTO staff_accounts(user_id,business_id) VALUES(?,?)',['cashier-demo','business-nena']);
    for(const [sid,name,location]of[['store-main','Main store','Quezon City'],['store-market','Market branch','Pasig']]){
      await tx.run('INSERT INTO stores VALUES(?,?,?,?)',[sid,'business-nena',name,location]);
      await tx.run('INSERT INTO memberships VALUES(?,?,?)',['owner-demo',sid,'owner']);
      await tx.run('INSERT INTO memberships VALUES(?,?,?)',['cashier-demo',sid,'cashier']);
      const products=[['Lucky Me! Pancit Canton','4807770270013','Noodles','pc',1500,1150,36,'LM'],['Kopiko Brown Coffee','8996001411638','Coffee','sachet',800,600,6,'K'],['Coca-Cola Original','4801981116085','Drinks','bottle',2000,1550,24,'C'],['Argentina Corned Beef','4800211351004','Canned goods','can',3800,3000,18,'A'],['White Rice','RICE-01','Essentials','kg',5500,4700,25,'R'],['Surf Powder','4800888151748','Household','sachet',800,550,40,'S'],['Silver Swan Soy Sauce','4800245009018','Condiments','pouch',1200,900,20,'SS'],['SkyFlakes Crackers','4800336001470','Snacks','pack',800,600,30,'SF']];
      let inventory=0;
      for(const [name,barcode,category,unit,price,cost,qty]of products){const pid=id();inventory+=cost*qty;await tx.run('INSERT INTO products(id,store_id,name,barcode,category,unit,price_minor,cost_minor,stock_milli,low_stock_milli,image_id,updated_at,stock_value_minor) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[pid,sid,name,barcode,category,unit,price,cost,qty*1000,10000,null,now(),cost*qty]);await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),sid,pid,qty*1000,'opening',pid,now()]);}
      await journal(tx,sid,'opening',sid,[{account:'inventory',debit:inventory},{account:'equity',credit:inventory}]);
      for(const [name,phone,balance]of[['Maria Santos','',35000],['Jun Dela Cruz','',18000],['Ana Cruz','',25000]]){const cid=id();await tx.run('INSERT INTO customers VALUES(?,?,?,?,?)',[cid,sid,name,phone,balance]);await journal(tx,sid,'opening',cid,[{account:'receivables',debit:balance},{account:'equity',credit:balance}]);}
      await journal(tx,sid,'opening',`${sid}-cash`,[{account:'cash',debit:100000},{account:'equity',credit:100000}]);
    }
  });
}
