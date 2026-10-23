import { randomUUID, createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export const hash=value=>createHash('sha256').update(value).digest('hex');
export class HttpError extends Error {constructor(status,message){super(message);this.statusCode=status;}}
export function passwordHash(value){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`;}
export function passwordMatches(value,stored){const[salt,key]=stored.split(':');const actual=scryptSync(value,salt,64);const expected=Buffer.from(key,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export function productView(p){return {id:p.id,storeId:p.store_id,name:p.name,barcode:p.barcode,category:p.category,unit:p.unit,priceMinor:p.price_minor,costMinor:p.cost_minor,stock:p.stock_milli/1000,lowStock:p.low_stock_milli/1000,imageId:p.image_id,updatedAt:p.updated_at,archivedAt:p.archived_at||null,...(p.archived_at?{archivedBarcode:p.archived_barcode||null}:{})};}
export function customerView(c){return {id:c.id,name:c.name,phone:c.phone,balanceMinor:c.balance_minor};}
export async function journal(tx,storeId,sourceType,sourceId,entries,at=now()){
  if(entries.reduce((s,e)=>s+(e.debit||0)-(e.credit||0),0)!==0)throw new Error('Unbalanced journal');
  for(const e of entries)if((e.debit||e.credit)>0)await tx.run('INSERT INTO journals(id,store_id,source_type,source_id,account,debit_minor,credit_minor,created_at) VALUES(?,?,?,?,?,?,?,?)',[id(),storeId,sourceType,sourceId,e.account,e.debit||0,e.credit||0,at]);
}
export async function audit(tx,userId,action,storeId,details={}){await tx.run('INSERT INTO audit_events VALUES(?,?,?,?,?,?)',[id(),userId,action,storeId,JSON.stringify(details),now()]);}
export async function postSale(db,user,storeId,input,{recordedPriceReason}={}){
  const normalized={storeId,lines:input.lines.map(l=>({productId:l.productId,quantity:l.quantity,priceMinor:l.priceMinor})).sort((a,b)=>a.productId.localeCompare(b.productId)),paymentMethod:input.paymentMethod,cashMinor:input.cashMinor||0,customerId:input.customerId||null,walletVerified:input.walletVerified||false};
  const requestHash=hash(JSON.stringify(normalized));
  return db.tx(async tx=>{
    // Serialize the store's financial writes across API instances on PostgreSQL.
    if(db.kind==='postgres')await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[storeId]);
    const member=await tx.get('SELECT role FROM memberships WHERE user_id=? AND store_id=?',[user.id,storeId]);if(!member)throw new HttpError(403,'Store access has been removed');if(recordedPriceReason&&(member.role!=='owner'||!input.offline))throw new HttpError(403,'Owner reconciliation requires an offline record');
    const existing=await tx.get('SELECT * FROM sales WHERE id=?',[input.id]);
    if(existing){if(existing.store_id!==storeId||existing.request_hash!==requestHash)throw new HttpError(409,'Transaction ID already used for different sale');return saleResult(tx,existing);}
    const settings=await tx.get('SELECT sales_enabled FROM store_settings WHERE store_id=?',[storeId]);if(settings&&Number(settings.sales_enabled)===0)throw new HttpError(409,'Sales paused for this branch. Ask the owner to resume, then sync pending sales.');
    if(input.paymentMethod==='wallet'&&!input.walletVerified)throw new HttpError(400,'Verify the wallet payment first');
    if(input.paymentMethod==='credit'&&!await tx.get('SELECT id FROM customers WHERE id=? AND store_id=?',[input.customerId||'',storeId]))throw new HttpError(400,'Choose a customer for utang');
    const lines=[];const seen=new Set();let total=0,cost=0;
    for(const l of input.lines){
      if(seen.has(l.productId))throw new HttpError(400,'Combine duplicate product lines');seen.add(l.productId);
      const p=await tx.get('SELECT * FROM products WHERE id=? AND store_id=? AND archived_at IS NULL',[l.productId,storeId]);if(!p)throw new HttpError(400,'Product is unavailable in this store');
      const quantity=Math.round(l.quantity*1000);if(Math.abs(l.quantity*1000-quantity)>.00001)throw new HttpError(400,'Quantity supports up to 3 decimals');
      if(!recordedPriceReason&&l.priceMinor!==p.price_minor)throw new HttpError(409,`${p.name}: price changed. Review queued sale.`);
      const amount=Math.round(l.priceMinor*quantity/1000),lineCost=p.unit==='service'?0:p.stock_milli>0&&quantity<=p.stock_milli?Math.round(p.stock_value_minor*quantity/p.stock_milli):Math.round(p.cost_minor*quantity/1000);
      total+=amount;cost+=lineCost;lines.push({p,quantity,amount,lineCost,chargedPrice:l.priceMinor});
    }
    if(total<=0)throw new HttpError(400,'Sale total must be positive');
    if(total>100000000)throw new HttpError(400,'Sale exceeds the transaction limit');
    if(input.paymentMethod==='cash'&&(input.cashMinor||0)<total)throw new HttpError(400,'Cash received is below the total');
    const at=now(),occurred=input.occurredAt||at;
    if(new Date(occurred).getTime()>Date.now()+300000)throw new HttpError(400,'Sale date cannot be in the future');
    await tx.run('INSERT INTO sales VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[input.id,storeId,user.id,requestHash,total,cost,input.paymentMethod,input.cashMinor||0,input.customerId||null,occurred,at,input.offline?'offline':'online','completed']);
    for(const {p,quantity,amount,lineCost,chargedPrice} of lines){
      await tx.run('INSERT INTO sale_lines(id,sale_id,store_id,product_id,name,quantity_milli,price_minor,cost_minor,total_minor,allocated_cost_minor) VALUES(?,?,?,?,?,?,?,?,?,?)',[id(),input.id,storeId,p.id,p.name,quantity,chargedPrice,p.cost_minor,amount,lineCost]);
      if(p.unit!=='service'){await tx.run('UPDATE products SET stock_milli=stock_milli-?,stock_value_minor=stock_value_minor-?,updated_at=? WHERE id=? AND store_id=?',[quantity,lineCost,at,p.id,storeId]);
      await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,p.id,-quantity,'sale',input.id,at]);}
    }
    const account={cash:'cash',wallet:'wallet',credit:'receivables'}[input.paymentMethod];
    if(input.paymentMethod==='credit')await tx.run('UPDATE customers SET balance_minor=balance_minor+? WHERE id=? AND store_id=?',[total,input.customerId,storeId]);
    await journal(tx,storeId,'sale',input.id,[{account,debit:total},{account:'sales',credit:total},{account:'cost_of_sales',debit:cost},{account:'inventory',credit:cost}],occurred);
    await audit(tx,user.id,'sale.created',storeId,{saleId:input.id,totalMinor:total,source:input.offline?'offline':'online',...(recordedPriceReason?{recordedPriceReason}: {})});
    return saleResult(tx,await tx.get('SELECT * FROM sales WHERE id=?',[input.id]));
  });
}
export async function saleResult(tx,sale){return {id:sale.id,totalMinor:sale.total_minor,costMinor:sale.cost_minor,paymentMethod:sale.payment_method,changeMinor:sale.payment_method==='cash'?sale.cash_minor-sale.total_minor:0,occurredAt:sale.occurred_at,status:sale.status,lines:await tx.all('SELECT id,name,quantity_milli,price_minor,total_minor,(SELECT COALESCE(SUM(r.quantity_milli),0) FROM sale_return_lines r WHERE r.sale_line_id=sale_lines.id) AS returned_milli FROM sale_lines WHERE sale_id=?',[sale.id])};}
export async function dashboard(db,storeId,day){
  // Business dates are Philippine dates; UTC boundaries preserve the local trading day.
  const start=new Date(`${day}T00:00:00+08:00`).toISOString(),end=new Date(new Date(start).getTime()+86400000).toISOString();
  const sales=await db.get("SELECT COUNT(*) AS count,COALESCE(SUM(total_minor),0) AS total,COALESCE(SUM(cost_minor),0) AS cost FROM sales WHERE store_id=? AND occurred_at>=? AND occurred_at<?",[storeId,start,end]);
  const expense=await db.get('SELECT COALESCE(SUM(amount_minor),0) AS total FROM expenses WHERE store_id=? AND occurred_at>=? AND occurred_at<?',[storeId,start,end]);
  const adjustment=await db.get("SELECT COALESCE(SUM(credit_minor-debit_minor),0) AS total FROM journals WHERE store_id=? AND account='inventory_adjustment' AND created_at>=? AND created_at<?",[storeId,start,end]);
  const net=await db.all("SELECT account,SUM(debit_minor-credit_minor) AS balance FROM journals WHERE store_id=? AND account IN ('sales','cost_of_sales') AND created_at>=? AND created_at<? GROUP BY account",[storeId,start,end]);
  sales.total=-Number(net.find(r=>r.account==='sales')?.balance||0);sales.cost=Number(net.find(r=>r.account==='cost_of_sales')?.balance||0);
  const debt=await db.get('SELECT COALESCE(SUM(balance_minor),0) AS total FROM customers WHERE store_id=?',[storeId]);
  const low=await db.all("SELECT * FROM products WHERE store_id=? AND archived_at IS NULL AND stock_milli<=low_stock_milli AND unit<>'service' ORDER BY stock_milli LIMIT 6",[storeId]);
  const recent=await db.all('SELECT id,total_minor,payment_method,occurred_at,status FROM sales WHERE store_id=? ORDER BY created_at DESC LIMIT 6',[storeId]);
  const accounts=await db.all('SELECT account,SUM(debit_minor-credit_minor) AS balance FROM journals WHERE store_id=? GROUP BY account',[storeId]);
  return {day,salesMinor:Number(sales.total),costMinor:Number(sales.cost),expensesMinor:Number(expense.total),adjustmentMinor:Number(adjustment.total),profitMinor:Number(sales.total)-Number(sales.cost)-Number(expense.total)+Number(adjustment.total),saleCount:Number(sales.count),utangMinor:Number(debt.total),lowStock:low.map(productView),recentSales:recent.map(s=>({id:s.id,totalMinor:s.total_minor,paymentMethod:s.payment_method,occurredAt:s.occurred_at,status:s.status})),accounts:accounts.map(a=>({account:a.account,balanceMinor:Number(a.balance)}))};
}
