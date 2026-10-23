import {command} from './finance.mjs';
import {HttpError,now,journal,audit,productView,id} from './domain.mjs';
export const canonicalBarcode=value=>{const code=String(value||'').trim();return /^\d{12}$/.test(code)?'0'+code:code;};
export async function updateProduct(db,user,storeId,productId,input){
 return command(db,user,storeId,`product.edit:${productId}`,input,async(tx,key)=>{
  if(!(await tx.get("SELECT user_id FROM memberships WHERE user_id=? AND store_id=? AND role='owner'",[user.id,storeId])))throw new HttpError(403,'Owner access required');
  const p=await tx.get('SELECT * FROM products WHERE id=? AND store_id=? AND archived_at IS NULL',[productId,storeId]);if(!p)throw new HttpError(404,'Product not found');
  if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==p.updated_at)throw new HttpError(409,'Product changed. Refresh and edit again.');
  const next={...p,name:input.name??p.name,barcode:input.barcode===undefined?p.barcode:canonicalBarcode(input.barcode)||null,category:input.category??p.category,unit:input.unit??p.unit,price_minor:input.priceMinor??p.price_minor,cost_minor:input.costMinor??p.cost_minor,stock_milli:input.stock===undefined?p.stock_milli:Math.round(input.stock*1000),low_stock_milli:input.lowStock===undefined?p.low_stock_milli:Math.round(input.lowStock*1000),image_id:input.imageId===undefined?p.image_id:input.imageId};
  if(input.stock!==undefined&&Math.abs(input.stock*1000-next.stock_milli)>.00001||input.lowStock!==undefined&&Math.abs(input.lowStock*1000-next.low_stock_milli)>.00001)throw new HttpError(400,'Use up to 3 decimal places');
  if(next.unit==='service'&&(next.stock_milli!==0||next.cost_minor!==0))throw new HttpError(400,'Services use zero stock and cost');
  if(next.unit!==p.unit&&(p.stock_milli!==0||await tx.get('SELECT id FROM sale_lines WHERE product_id=? LIMIT 1',[p.id])))throw new HttpError(409,'Unit is locked after stock or sales. Create a separate product.');
  if(next.image_id&&!await tx.get('SELECT id FROM images WHERE id=? AND store_id=?',[next.image_id,storeId]))throw new HttpError(404,'Image not found');
  if(next.barcode){const others=await tx.all('SELECT id,barcode FROM products WHERE store_id=? AND archived_at IS NULL AND id<>? AND barcode IS NOT NULL',[storeId,p.id]);if(others.some(row=>canonicalBarcode(row.barcode)===next.barcode))throw new HttpError(409,'Barcode already belongs to another product');}
  const inventoryChanged=next.cost_minor!==p.cost_minor||next.stock_milli!==p.stock_milli;
  if(inventoryChanged&&next.stock_milli<0)throw new HttpError(400,'Enter a non-negative stock count');
  if(inventoryChanged&&!input.reason?.trim())throw new HttpError(400,'Add a stock or cost adjustment note');
  let value=p.stock_value_minor;
  if(inventoryChanged)value=next.cost_minor===p.cost_minor&&p.stock_milli>0?Math.round(p.stock_value_minor*next.stock_milli/p.stock_milli):Math.round(next.cost_minor*next.stock_milli/1000);
  if(inventoryChanged&&(value<0||value>100000000))throw new HttpError(400,'Inventory value exceeds the limit');
  const delta=value-p.stock_value_minor,at=now();
  await tx.run('UPDATE products SET name=?,barcode=?,category=?,unit=?,price_minor=?,cost_minor=?,stock_milli=?,low_stock_milli=?,image_id=?,stock_value_minor=?,updated_at=? WHERE id=? AND store_id=?',[next.name,next.barcode,next.category,next.unit,next.price_minor,next.cost_minor,next.stock_milli,next.low_stock_milli,next.image_id,value,at,p.id,storeId]);
  if(inventoryChanged){await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,p.id,next.stock_milli-p.stock_milli,'product_adjustment',key,at]);await journal(tx,storeId,'product_adjustment',key,delta>=0?[{account:'inventory',debit:delta},{account:'inventory_adjustment',credit:delta}]:[{account:'inventory_adjustment',debit:-delta},{account:'inventory',credit:-delta}],at);}
  await audit(tx,user.id,'product.updated',storeId,{productId:p.id,reason:input.reason||'',inventoryAdjustmentMinor:delta,before:{name:p.name,barcode:p.barcode,category:p.category,unit:p.unit,priceMinor:p.price_minor,costMinor:p.cost_minor,stockMilli:p.stock_milli,imageId:p.image_id},after:{name:next.name,barcode:next.barcode,category:next.category,unit:next.unit,priceMinor:next.price_minor,costMinor:next.cost_minor,stockMilli:next.stock_milli,imageId:next.image_id}});
  return {product:productView(await tx.get('SELECT * FROM products WHERE id=?',[p.id]))};
 });
}

export async function archiveProduct(db,user,storeId,productId,input){
 return command(db,user,storeId,`product.archive:${productId}`,input,async(tx,key)=>{
  if(!await tx.get("SELECT user_id FROM memberships WHERE user_id=? AND store_id=? AND role='owner'",[user.id,storeId]))throw new HttpError(403,'Owner access required');
  const p=await tx.get('SELECT * FROM products WHERE id=? AND store_id=?',[productId,storeId]);
  if(!p||p.archived_at)throw new HttpError(404,'Product not found');
  if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==p.updated_at)throw new HttpError(409,'Product changed. Refresh and try again.');
  const remaining=p.stock_milli!==0||Number(p.stock_value_minor)!==0;
  if(remaining&&!input.writeOff)throw new HttpError(409,'This product still has stock. Confirm the stock write-off to remove it.');
  const at=now(),writtenOff=-Number(p.stock_value_minor);
  // Remaining stock leaves inventory through the same adjustment path as a stock count, so ledgers stay balanced.
  if(remaining){await tx.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)',[id(),storeId,p.id,-p.stock_milli,'count',key,at]);await journal(tx,storeId,'stock_count',key,writtenOff>=0?[{account:'inventory',debit:writtenOff},{account:'inventory_adjustment',credit:writtenOff}]:[{account:'inventory_adjustment',debit:-writtenOff},{account:'inventory',credit:-writtenOff}],at);await audit(tx,user.id,'stock.counted',storeId,{productId:p.id,quantity:0,reason:'Product removed',adjustmentMinor:writtenOff});}
  await tx.run('UPDATE products SET archived_at=?,archived_barcode=barcode,barcode=NULL,stock_milli=0,stock_value_minor=0,updated_at=? WHERE id=? AND store_id=?',[at,at,productId,storeId]);
  await audit(tx,user.id,'product.archived',storeId,{productId,name:p.name,barcode:p.barcode,writtenOffMilli:p.stock_milli,writtenOffMinor:-writtenOff});
  return {product:productView(await tx.get('SELECT * FROM products WHERE id=?',[productId]))};
 });
}

export async function restoreProduct(db,user,storeId,productId,input){
 return command(db,user,storeId,`product.restore:${productId}`,input,async tx=>{
  if(!await tx.get("SELECT user_id FROM memberships WHERE user_id=? AND store_id=? AND role='owner'",[user.id,storeId]))throw new HttpError(403,'Owner access required');
  const p=await tx.get('SELECT * FROM products WHERE id=? AND store_id=?',[productId,storeId]);
  if(!p||!p.archived_at)throw new HttpError(404,'Removed product not found');
  if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==p.updated_at)throw new HttpError(409,'Product changed. Refresh and try again.');
  // The barcode comes back unless an active product has claimed it since removal.
  let barcode=p.archived_barcode;if(barcode){const others=await tx.all('SELECT barcode FROM products WHERE store_id=? AND archived_at IS NULL AND id<>? AND barcode IS NOT NULL',[storeId,p.id]);if(others.some(row=>canonicalBarcode(row.barcode)===canonicalBarcode(barcode)))barcode=null;}
  const at=now();await tx.run('UPDATE products SET archived_at=NULL,archived_barcode=NULL,barcode=?,updated_at=? WHERE id=? AND store_id=?',[barcode,at,productId,storeId]);
  await audit(tx,user.id,'product.restored',storeId,{productId,name:p.name,barcodeCleared:barcode!==p.archived_barcode});
  return {product:productView(await tx.get('SELECT * FROM products WHERE id=?',[productId])),barcodeCleared:barcode!==p.archived_barcode};
 });
}
