import {id,now,journal,audit,HttpError} from './domain.mjs';
import {command} from './finance.mjs';
export async function transferStock(db,user,sourceStore,input){
 const eligible=async tx=>{const rows=await tx.all("SELECT s.id,s.business_id FROM stores s JOIN memberships m ON m.store_id=s.id WHERE m.user_id=? AND m.role='owner' AND s.id IN (?,?)",[user.id,sourceStore,input.targetStoreId]);if(sourceStore===input.targetStoreId||rows.length!==2||rows[0].business_id!==rows[1].business_id)throw new HttpError(403,'Own both branches in the same business to transfer stock');};
 await eligible(db);
 return command(db,user,sourceStore,'stock.transfer',input,async(tx,key)=>{
  await eligible(tx);const source=await tx.get('SELECT * FROM products WHERE id=? AND store_id=? AND archived_at IS NULL',[input.sourceProductId,sourceStore]),target=await tx.get('SELECT * FROM products WHERE id=? AND store_id=? AND archived_at IS NULL',[input.targetProductId,input.targetStoreId]);
  if(!source||!target)throw new HttpError(404,'Choose products from the correct branches');if(source.unit==='service'||source.unit!==target.unit)throw new HttpError(400,'Products must have the same stock unit. Services cannot be transferred');if(source.barcode&&target.barcode&&source.barcode!==target.barcode)throw new HttpError(400,'Product barcodes do not match');
  const qty=Math.round(input.quantity*1000);if(qty<=0||Math.abs(input.quantity*1000-qty)>.00001||qty>source.stock_milli)throw new HttpError(400,'Transfer quantity exceeds available stock or uses more than 3 decimals');if(target.stock_milli<0)throw new HttpError(409,'Resolve negative destination stock first');
  const value=Math.round(source.stock_value_minor*qty/source.stock_milli),at=now(),targetQty=target.stock_milli+qty,targetValue=target.stock_value_minor+value;
  await tx.run('UPDATE products SET stock_milli=stock_milli-?,stock_value_minor=stock_value_minor-?,updated_at=? WHERE id=?',[qty,value,at,source.id]);await tx.run('UPDATE products SET stock_milli=?,stock_value_minor=?,cost_minor=?,updated_at=? WHERE id=?',[targetQty,targetValue,Math.round(targetValue*1000/targetQty),at,target.id]);
  await tx.run('INSERT INTO stock_transfers(id,source_store_id,target_store_id,source_product_id,target_product_id,quantity_milli,value_minor,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[key,sourceStore,input.targetStoreId,source.id,target.id,qty,value,input.note,at]);
  for(const [sid,pid,q]of [[sourceStore,source.id,-qty],[input.targetStoreId,target.id,qty]])await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),sid,pid,q,'transfer',key,at]);
  await journal(tx,sourceStore,'stock_transfer',key,[{account:'equity',debit:value},{account:'inventory',credit:value}],at);await journal(tx,input.targetStoreId,'stock_transfer',key,[{account:'inventory',debit:value},{account:'equity',credit:value}],at);
  await audit(tx,user.id,'stock.transferred',sourceStore,{transferId:key,targetStoreId:input.targetStoreId,quantity:input.quantity,valueMinor:value,note:input.note});return {id:key,valueMinor:value};
 },{lockStoreIds:[input.targetStoreId]});
}
