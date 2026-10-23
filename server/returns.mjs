import {id,now,journal,audit,HttpError} from './domain.mjs';
import {command} from './finance.mjs';
export async function returnSale(db,user,storeId,saleId,input){return command(db,user,storeId,`sale.return:${saleId}`,input,async(tx,key)=>{
 const sale=await tx.get('SELECT * FROM sales WHERE id=? AND store_id=?',[saleId,storeId]);if(!sale)throw new HttpError(404,'Sale not found');if(sale.status==='refunded')throw new HttpError(409,'Sale already fully refunded');
 const all=await tx.all('SELECT * FROM sale_lines WHERE sale_id=? AND store_id=? ORDER BY id',[saleId,storeId]);const weights=all.map(l=>l.cost_minor*l.quantity_milli),weight=weights.reduce((s,v)=>s+v,0);let allocated=0;
 for(let i=0;i<all.length;i++){const l=all[i];l.exactCost=l.allocated_cost_minor??(i===all.length-1?sale.cost_minor-allocated:Math.floor(sale.cost_minor*(weight?weights[i]/weight:1/all.length)));allocated+=l.exactCost;}
 const seen=new Set(),lines=[];let amount=0,cost=0;
 for(const item of input.lines){if(seen.has(item.lineId))throw new HttpError(400,'Combine duplicate return lines');seen.add(item.lineId);const l=all.find(l=>l.id===item.lineId);if(!l)throw new HttpError(400,'Return line does not belong to this sale');
  const previous=await tx.get('SELECT COALESCE(SUM(quantity_milli),0) AS qty,COALESCE(SUM(amount_minor),0) AS amount,COALESCE(SUM(cost_minor),0) AS cost FROM sale_return_lines WHERE sale_line_id=?',[l.id]);const qty=Math.round(item.quantity*1000);
  if(qty<=0||Math.abs(item.quantity*1000-qty)>.00001||Number(previous.qty)+qty>l.quantity_milli)throw new HttpError(400,'Return quantity exceeds the remaining sale quantity');
  const totalQty=Number(previous.qty)+qty,lineAmount=Math.round(l.total_minor*totalQty/l.quantity_milli)-Number(previous.amount),lineCost=Math.round(l.exactCost*totalQty/l.quantity_milli)-Number(previous.cost);
  amount+=lineAmount;cost+=lineCost;lines.push({l,qty,lineAmount,lineCost});
 }
 if(amount<=0)throw new HttpError(400,'Return value must be positive');const cancel=input.creditCancelMinor||0;
 if(cancel&&(sale.payment_method!=='credit'||cancel>amount))throw new HttpError(400,'Debt cancellation is only available for this credit sale, up to the return value');
 if(cancel){const customer=await tx.get('SELECT balance_minor FROM customers WHERE id=? AND store_id=?',[sale.customer_id,storeId]);if(!customer||cancel>customer.balance_minor)throw new HttpError(400,'Cancellation exceeds the customer outstanding balance');}
 const paidBack=amount-cancel;if(paidBack){const balance=await tx.get('SELECT COALESCE(SUM(debit_minor-credit_minor),0) AS n FROM journals WHERE store_id=? AND account=?',[storeId,input.refundMethod]);if(paidBack>Number(balance.n))throw new HttpError(400,'Recorded funds are below this refund');}
 const at=now();await tx.run('INSERT INTO sale_returns(id,store_id,sale_id,amount_minor,cost_minor,credit_cancel_minor,refund_method,restock,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[key,storeId,saleId,amount,cost,cancel,input.refundMethod,input.restock?1:0,input.reason,at]);
 for(const {l,qty,lineAmount,lineCost} of lines){await tx.run('INSERT INTO sale_return_lines(id,return_id,sale_line_id,quantity_milli,amount_minor,cost_minor) VALUES(?,?,?,?,?,?)',[id(),key,l.id,qty,lineAmount,lineCost]);
  const p=await tx.get('SELECT * FROM products WHERE id=? AND store_id=?',[l.product_id,storeId]);if(input.restock&&p.archived_at)throw new HttpError(409,'Restore the product before restocking a return');if(input.restock&&p.unit!=='service'){const newQty=p.stock_milli+qty,newValue=p.stock_value_minor+lineCost;await tx.run('UPDATE products SET stock_milli=?,stock_value_minor=?,cost_minor=?,updated_at=? WHERE id=?',[newQty,newValue,newQty>0?Math.round(newValue*1000/newQty):p.cost_minor,at,p.id]);await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,p.id,qty,'return',key,at]);}
 }
 if(cancel)await tx.run('UPDATE customers SET balance_minor=balance_minor-? WHERE id=? AND store_id=?',[cancel,sale.customer_id,storeId]);
 const entries=[{account:'sales',debit:amount},{account:input.refundMethod,credit:paidBack},{account:'receivables',credit:cancel}];if(input.restock)entries.push({account:'inventory',debit:cost},{account:'cost_of_sales',credit:cost});await journal(tx,storeId,'sale_return',key,entries,at);
 const qty=await tx.get('SELECT COALESCE(SUM(r.quantity_milli),0) AS n FROM sale_return_lines r JOIN sale_lines l ON l.id=r.sale_line_id WHERE l.sale_id=?',[saleId]);const complete=Number(qty.n)===all.reduce((s,l)=>s+l.quantity_milli,0);await tx.run('UPDATE sales SET status=? WHERE id=?',[complete?'refunded':'partially_refunded',saleId]);
 await audit(tx,user.id,'sale.returned',storeId,{returnId:key,saleId,amountMinor:amount,creditCancelMinor:cancel,paidBackMinor:paidBack,reason:input.reason,restock:input.restock});return {id:key,amountMinor:amount,creditCancelMinor:cancel,paidBackMinor:paidBack};
});}
