import {id,now,hash,HttpError,journal,audit} from './domain.mjs';

export const businessDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function moneyMovement(db,user,storeId,input){return command(db,user,storeId,'money.movement',input,async(tx,key)=>{
  const balance=async account=>Number((await tx.get('SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS balance FROM journals WHERE store_id=? AND account=?',[storeId,account])).balance);
  if(input.type!=='capital'&&await balance(input.paymentMethod)<input.amountMinor)throw new HttpError(400,'Recorded funds are below this amount. Review the balance first.');
  if(input.type==='supplier_payment'){
    const assigned=Number((await tx.get('SELECT COALESCE(SUM(total_minor-paid_minor),0) AS n FROM purchase_invoices WHERE store_id=?',[storeId])).n);
    if(input.amountMinor>-(await balance('payables'))-assigned)throw new HttpError(400,'Payment exceeds unassigned supplier debt. Pay named invoices in Suppliers.');
  }
  const other=input.type==='supplier_payment'?'payables':input.type==='transfer'?(input.paymentMethod==='cash'?'wallet':'cash'):'equity';
  const entries=input.type==='capital'?[{account:input.paymentMethod,debit:input.amountMinor},{account:other,credit:input.amountMinor}]:[{account:other,debit:input.amountMinor},{account:input.paymentMethod,credit:input.amountMinor}];
  const at=now();await journal(tx,storeId,input.type,key,entries,at);
  await tx.run('INSERT INTO money_movements(id,store_id,user_id,type,amount_minor,payment_method,note,created_at) VALUES(?,?,?,?,?,?,?,?)',[key,storeId,user.id,input.type,input.amountMinor,input.paymentMethod,input.note,at]);
  await audit(tx,user.id,'money.recorded',storeId,{movementId:key,...input});return {id:key};
});}
export function bounds(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new HttpError(400,'Invalid date');const utc=new Date(`${day}T00:00:00Z`);if(!Number.isFinite(utc.getTime())||utc.toISOString().slice(0,10)!==day)throw new HttpError(400,'Invalid date');const start=new Date(utc.getTime()-28800000);return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()];}

// Persist the response in the same transaction as its financial effects.
export async function command(db,user,storeId,kind,input,work,{lockStoreIds=[]}={}){return db.tx(async tx=>{
  if(db.kind==='postgres')for(const sid of [...new Set([storeId,...lockStoreIds])].sort())await tx.get('SELECT id FROM stores WHERE id=? FOR UPDATE',[sid]);
  const key=input.id||id(),digest=hash(JSON.stringify({kind,storeId,userId:user.id,input}));
  const previous=await tx.get('SELECT * FROM financial_commands WHERE id=?',[key]);
  if(previous){if(previous.request_hash!==digest)throw new HttpError(409,'Request ID already used. Start a new entry.');return JSON.parse(previous.result);}
  const result=await work(tx,key);
  await tx.run('INSERT INTO financial_commands(id,store_id,request_hash,result,created_at) VALUES(?,?,?,?,?)',[key,storeId,digest,JSON.stringify(result),now()]);return result;
});}

export async function report(tx,storeId,from,to){
  const [start]=bounds(from),[,end]=bounds(to);if(start>=end)throw new HttpError(400,'Choose a valid date range');
  const period=await tx.all('SELECT account,SUM(debit_minor-credit_minor) AS balance FROM journals WHERE store_id=? AND created_at>=? AND created_at<? GROUP BY account',[storeId,start,end]);
  const trial=await tx.all('SELECT account,SUM(debit_minor) AS debits,SUM(credit_minor) AS credits FROM journals WHERE store_id=? AND created_at<? GROUP BY account ORDER BY account',[storeId,end]);
  const p=Object.fromEntries(period.map(r=>[r.account,Number(r.balance)])),a=Object.fromEntries(trial.map(r=>[r.account,Number(r.debits)-Number(r.credits)]));
  const sales=-(p.sales||0),cost=p.cost_of_sales||0,expenses=p.expenses||0,adjustment=-(p.inventory_adjustment||0),cashVariance=-(p.cash_variance||0);
  const assets=['cash','wallet','receivables','inventory'].reduce((s,k)=>s+(a[k]||0),0),liabilities=-(a.payables||0),capital=-(a.equity||0),earnings=-(a.sales||0)-(a.cost_of_sales||0)-(a.expenses||0)-(a.inventory_adjustment||0)-(a.cash_variance||0);
  const movements=await tx.all("SELECT source_type,SUM(debit_minor-credit_minor) AS n FROM journals WHERE store_id=? AND account IN ('cash','wallet') AND created_at>=? AND created_at<? GROUP BY source_type",[storeId,start,end]);
  const opening=Number((await tx.get("SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS n FROM journals WHERE store_id=? AND account IN ('cash','wallet') AND created_at<?",[storeId,start])).n);
  const recordedOpening=movements.filter(r=>r.source_type==='opening').reduce((s,r)=>s+Number(r.n),0),financing=movements.filter(r=>['capital','drawing'].includes(r.source_type)).reduce((s,r)=>s+Number(r.n),0),operating=movements.filter(r=>!['opening','capital','drawing','transfer'].includes(r.source_type)).reduce((s,r)=>s+Number(r.n),0),internal=movements.filter(r=>r.source_type==='transfer').reduce((s,r)=>s+Number(r.n),0);
  const cashFlow={openingMinor:opening,recordedOpeningMinor:recordedOpening,operatingMinor:operating,financingMinor:financing,internalMinor:internal,closingMinor:(a.cash||0)+(a.wallet||0)};
  return {cashFlow,from,to,salesMinor:sales,costMinor:cost,expensesMinor:expenses,adjustmentMinor:adjustment,cashVarianceMinor:cashVariance,profitMinor:sales-cost-expenses+adjustment+cashVariance,assetsMinor:assets,liabilitiesMinor:liabilities,capitalMinor:capital,earningsMinor:earnings,balanceCheckMinor:assets-liabilities-capital-earnings,cashMovementMinor:p.cash||0,walletMovementMinor:p.wallet||0,accounts:trial.map(r=>({account:r.account,debitMinor:Number(r.debits),creditMinor:Number(r.credits),balanceMinor:Number(r.debits)-Number(r.credits)}))};
}

export async function closeDay(db,user,storeId,input){return command(db,user,storeId,'cash.close',input,async(tx,key)=>{
  const [start,end]=bounds(input.day);if(input.day!==businessDay())throw new HttpError(400,'Close today only');
  if(await tx.get('SELECT id FROM cash_closings WHERE store_id=? AND day=?',[storeId,input.day]))throw new HttpError(409,'Today is already closed');
  const row=await tx.get("SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS balance FROM journals WHERE store_id=? AND account='cash' AND created_at<?",[storeId,end]);
  const expected=Number(row.balance),variance=input.countedMinor-expected,at=now();
  if(variance&&!input.note.trim())throw new HttpError(400,'Add a note for the cash difference');
  // A close records a count; it never silently writes off a cash difference.
  const count=await tx.get('SELECT COUNT(*) AS count FROM journals WHERE store_id=? AND created_at>=? AND created_at<?',[storeId,start,end]);
  await tx.run('INSERT INTO cash_closings(id,store_id,day,user_id,expected_minor,counted_minor,variance_minor,note,journal_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[key,storeId,input.day,user.id,expected,input.countedMinor,variance,input.note,Number(count.count),at]);
  await audit(tx,user.id,'cash.closed',storeId,{day:input.day,expectedMinor:expected,countedMinor:input.countedMinor,varianceMinor:variance,note:input.note});return {id:key,expectedMinor:expected,countedMinor:input.countedMinor,varianceMinor:variance};
});}

export async function closings(db,storeId){const rows=await db.all('SELECT * FROM cash_closings WHERE store_id=? ORDER BY day DESC LIMIT 31',[storeId]);return Promise.all(rows.map(async r=>{const[start,end]=bounds(r.day);const count=await db.get('SELECT COUNT(*) AS count FROM journals WHERE store_id=? AND created_at>=? AND created_at<?',[storeId,start,end]);return {...r,lateEntries:Number(count.count)!==Number(r.journal_count)};}));}

export async function refund(db,user,storeId,saleId,input){return command(db,user,storeId,`refund:${saleId}`,input,async(tx,key)=>{
  const sale=await tx.get('SELECT * FROM sales WHERE id=? AND store_id=?',[saleId,storeId]);if(!sale)throw new HttpError(404,'Sale not found');
  if(sale.status!=='completed')throw new HttpError(409,'Sale already refunded');
  if(sale.payment_method==='credit')throw new HttpError(400,'Utang refunds need payment allocation. Contact the owner to reconcile this sale.');
  const at=now();const entries=[{account:'sales',debit:sale.total_minor},{account:sale.payment_method,credit:sale.total_minor}];
  if(input.restock){
    const lines=await tx.all("SELECT l.* FROM sale_lines l JOIN products p ON p.id=l.product_id AND p.store_id=l.store_id WHERE l.sale_id=? AND p.unit<>'service'",[saleId]);
    // Historical lines use a proportional allocation of the exact posted total cost.
    let allocated=0;const weights=lines.map(l=>l.cost_minor*l.quantity_milli),weight=weights.reduce((s,v)=>s+v,0);
    for(let index=0;index<lines.length;index++){const l=lines[index],value=l.allocated_cost_minor??(index===lines.length-1?sale.cost_minor-allocated:Math.floor(sale.cost_minor*(weight?weights[index]/weight:1/lines.length)));allocated+=value;
      await tx.run('UPDATE products SET stock_milli=stock_milli+?,stock_value_minor=stock_value_minor+?,updated_at=? WHERE id=? AND store_id=?',[l.quantity_milli,value,at,l.product_id,storeId]);
      const product=await tx.get('SELECT stock_milli,stock_value_minor FROM products WHERE id=? AND store_id=?',[l.product_id,storeId]);
      if(product.stock_milli>0)await tx.run('UPDATE products SET cost_minor=? WHERE id=? AND store_id=?',[Math.round(product.stock_value_minor*1000/product.stock_milli),l.product_id,storeId]);
      await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,l.product_id,l.quantity_milli,'refund',key,at]);
    }
    entries.push({account:'inventory',debit:sale.cost_minor},{account:'cost_of_sales',credit:sale.cost_minor});
  }
  await journal(tx,storeId,'refund',key,entries,at);
  await tx.run("UPDATE sales SET status='refunded' WHERE id=? AND store_id=?",[saleId,storeId]);
  await audit(tx,user.id,'sale.refunded',storeId,{refundId:key,saleId,reason:input.reason,restock:input.restock,totalMinor:sale.total_minor});return {id:key,saleId,totalMinor:sale.total_minor};
});}
