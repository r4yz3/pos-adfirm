import {useRef,useState} from 'react';
import {AlertTriangle,ArchiveRestore,ReceiptText,Trash2} from 'lucide-react';
import {api,formatMoney as peso} from './api';
import type {Product,Session} from './types';

export default function DeleteProduct({session,storeId,product,owner,onCancel,onRemoved}:{session:Session;storeId:string;product:Product;owner:boolean;onCancel:()=>void;onRemoved:(product:Product)=>Promise<void>}){
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef(crypto.randomUUID());
 const hasStock=product.unit!=='service'&&product.stock!==0,stockValue=Math.round((product.costMinor||0)*product.stock);
 async function remove(){if(busy||hasStock&&!confirmed)return;setBusy(true);setError('');try{
  await api(`/stores/${storeId}/products/${product.id}`,session,{method:'DELETE',body:JSON.stringify({id:key.current,expectedUpdatedAt:product.updatedAt,...(hasStock?{writeOff:true}:{})})});await onRemoved(product);
 }catch(e){setError((e as Error).message);setBusy(false);}}
 return <div className="delete-product">{error&&<div className="alert error" role="alert">{error}</div>}
  <span className="delete-product-icon"><Trash2 size={24}/></span>
  <h3>Remove “{product.name}”?</h3>
  <p>It will no longer appear in selling, inventory or barcode scans.</p>
  <dl className="delete-product-summary"><div><dt>Price</dt><dd>{peso(product.priceMinor)}</dd></div><div><dt>On hand</dt><dd>{product.unit==='service'?'Service':`${product.stock} ${product.unit}`}</dd></div>{owner&&product.unit!=='service'&&<div><dt>Stock value</dt><dd>{peso(stockValue)}</dd></div>}</dl>
  <ul className="delete-product-notes"><li><ReceiptText size={16}/><span>Past sales, receipts and reports stay intact.</span></li><li><ArchiveRestore size={16}/><span>Restore it anytime from <b>Products → Removed</b>.</span></li></ul>
  {hasStock&&<label className="delete-product-writeoff"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span><b><AlertTriangle size={15}/> Write off remaining stock</b><small>{product.stock} {product.unit}{owner?` (${peso(stockValue)})`:''} will be recorded as a stock adjustment and reduce today’s profit.</small></span></label>}
  <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Keep product</button><button type="button" className="button danger-button" disabled={busy||hasStock&&!confirmed} onClick={()=>void remove()}><Trash2 size={16}/>{busy?'Removing…':'Remove product'}</button></div>
 </div>;
}
