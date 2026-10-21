import {id,now,journal,audit,HttpError} from './domain.mjs';
import {command,bounds} from './finance.mjs';

export async function supplierSummary(db,storeId){
 const suppliers=await db.all('SELECT s.id,s.name,s.phone,COALESCE((SELECT SUM(i.total_minor-i.paid_minor) FROM purchase_invoices i WHERE i.supplier_id=s.id AND i.store_id=s.store_id),0) AS "balanceMinor" FROM suppliers s WHERE s.store_id=? ORDER BY s.name',[storeId]);
 const invoices=await db.all('SELECT i.id,i.reference,i.due_day AS "dueDay",i.total_minor AS "totalMinor",i.paid_minor AS "paidMinor",i.created_at AS "createdAt",s.name AS "supplierName" FROM purchase_invoices i JOIN suppliers s ON s.id=i.supplier_id AND s.store_id=i.store_id WHERE i.store_id=? ORDER BY CASE WHEN i.paid_minor<i.total_minor THEN 0 ELSE 1 END,i.created_at DESC LIMIT 100',[storeId]);
 const payable=Number((await db.get("SELECT COALESCE(SUM(credit_minor-debit_minor),0) AS n FROM journals WHERE store_id=? AND account='payables'",[storeId])).n);
 const assigned=Number((await db.get('SELECT COALESCE(SUM(total_minor-paid_minor),0) AS n FROM purchase_invoices WHERE store_id=?',[storeId])).n);
 return {suppliers,invoices,unassignedDebtMinor:payable-assigned};
}

export async function receivePurchase(db,user,storeId,input){return command(db,user,storeId,'purchase.receive',input,async(tx,key)=>{
 if(!await tx.get('SELECT id FROM suppliers WHERE id=? AND store_id=?',[input.supplierId,storeId]))throw new HttpError(404,'Supplier not found');
 if(input.dueDay)bounds(input.dueDay);
 if(await tx.get('SELECT id FROM purchase_invoices WHERE store_id=? AND supplier_id=? AND reference=?',[storeId,input.supplierId,input.reference]))throw new HttpError(409,'This supplier invoice is already recorded');
 const seen=new Set(),lines=[];let total=0;
 for(const l of input.lines){if(seen.has(l.productId))throw new HttpError(400,'Combine duplicate products');seen.add(l.productId);
  const product=await tx.get('SELECT * FROM products WHERE id=? AND store_id=?',[l.productId,storeId]);if(!product)throw new HttpError(404,'Product not found in this store');if(product.unit==='service')throw new HttpError(400,'Services do not have stock');if(product.stock_milli<0)throw new HttpError(409,'Resolve negative stock before receiving purchases');
  const qty=Math.round(l.quantity*1000);if(qty<1||Math.abs(l.quantity*1000-qty)>.00001)throw new HttpError(400,'Quantity supports 3 decimals');
  const value=Math.round(qty*l.unitCostMinor/1000);total+=value;lines.push({product,qty,value,unitCost:l.unitCostMinor});
 }
 if(total<=0||total>100000000)throw new HttpError(400,'Invoice total must be between ₱0.01 and ₱1,000,000');
 const at=now();await tx.run('INSERT INTO purchase_invoices(id,store_id,supplier_id,reference,due_day,total_minor,paid_minor,created_at) VALUES(?,?,?,?,?,?,?,?)',[key,storeId,input.supplierId,input.reference,input.dueDay||null,total,0,at]);
 for(const l of lines){const p=l.product,qty=p.stock_milli+l.qty,value=p.stock_value_minor+l.value;
  await tx.run('UPDATE products SET stock_milli=?,stock_value_minor=?,cost_minor=?,updated_at=? WHERE id=? AND store_id=?',[qty,value,Math.round(value*1000/qty),at,p.id,storeId]);
  await tx.run('INSERT INTO purchase_lines(id,invoice_id,store_id,product_id,name,quantity_milli,unit_cost_minor,total_minor) VALUES(?,?,?,?,?,?,?,?)',[id(),key,storeId,p.id,p.name,l.qty,l.unitCost,l.value]);
  await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,p.id,l.qty,'purchase',key,at]);
 }
 await journal(tx,storeId,'purchase',key,[{account:'inventory',debit:total},{account:'payables',credit:total}],at);
 await audit(tx,user.id,'purchase.received',storeId,{invoiceId:key,supplierId:input.supplierId,totalMinor:total});return {id:key,totalMinor:total};
});}

export async function payInvoice(db,user,storeId,invoiceId,input){return command(db,user,storeId,`purchase.pay:${invoiceId}`,input,async(tx,key)=>{
 const invoice=await tx.get('SELECT * FROM purchase_invoices WHERE id=? AND store_id=?',[invoiceId,storeId]);if(!invoice)throw new HttpError(404,'Invoice not found');
 if(input.amountMinor>invoice.total_minor-invoice.paid_minor)throw new HttpError(400,'Payment exceeds invoice balance');
 const funds=Number((await tx.get('SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS n FROM journals WHERE store_id=? AND account=?',[storeId,input.paymentMethod])).n);
 if(input.amountMinor>funds)throw new HttpError(400,'Recorded funds are below this payment');
 const at=now();await tx.run('UPDATE purchase_invoices SET paid_minor=paid_minor+? WHERE id=? AND store_id=?',[input.amountMinor,invoiceId,storeId]);
 await tx.run('INSERT INTO supplier_payments(id,store_id,invoice_id,amount_minor,payment_method,note,created_at) VALUES(?,?,?,?,?,?,?)',[key,storeId,invoiceId,input.amountMinor,input.paymentMethod,input.note,at]);
 await journal(tx,storeId,'supplier_payment',key,[{account:'payables',debit:input.amountMinor},{account:input.paymentMethod,credit:input.amountMinor}],at);
 await audit(tx,user.id,'supplier.paid',storeId,{invoiceId,paymentId:key,amountMinor:input.amountMinor});return {id:key};
});}
