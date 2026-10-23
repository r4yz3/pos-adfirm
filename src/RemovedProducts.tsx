import {useEffect,useState} from 'react';
import {ArchiveRestore,Package,Search} from 'lucide-react';
import {api,formatMoney as peso} from './api';
import type {Product,Session} from './types';

const removedOn=(at?:string|null)=>at?new Date(at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'}):'';

export default function RemovedProducts({session,storeId,onChange,onToast}:{session:Session;storeId:string;onChange:()=>Promise<void>;onToast:(message:string)=>void}){
 const [products,setProducts]=useState<Product[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState('');
 useEffect(()=>{let active=true;api<{products:Product[]}>(`/stores/${storeId}/products/removed`,session).then(r=>{if(active)setProducts(r.products);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[session,storeId]);
 async function restore(product:Product){setBusy(product.id);setError('');try{const r=await api<{barcodeCleared:boolean}>(`/stores/${storeId}/products/${product.id}/restore`,session,{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),expectedUpdatedAt:product.updatedAt})});setProducts(rows=>rows.filter(row=>row.id!==product.id));await onChange();onToast(r.barcodeCleared?`${product.name} restored · barcode now used by another product`:`${product.name} restored`);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const q=query.trim().toLowerCase(),shown=products.filter(p=>!q||`${p.name} ${p.category} ${p.archivedBarcode||''}`.toLowerCase().includes(q));
 return <div className="removed-products">{error&&<div className="alert error" role="alert">{error}</div>}
  <p className="fineprint">Removed products are hidden from selling and inventory. Their sales history stays in reports. Restored products return with zero stock.</p>
  {products.length>5&&<label className="search-field"><Search size={17}/><input aria-label="Search removed products" placeholder="Search removed products" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
  {loading?<p className="fineprint">Loading removed products…</p>:shown.length?<div className="removed-product-list">{shown.map(product=><div className="removed-product-row" key={product.id}><span className="row-icon"><Package size={20}/></span><div><b>{product.name}</b><small>{product.category} · {peso(product.priceMinor)}{product.archivedBarcode?` · ${product.archivedBarcode}`:''}</small><small>Removed {removedOn(product.archivedAt)}</small></div><button className="button secondary" disabled={!!busy} onClick={()=>void restore(product)}><ArchiveRestore size={16}/>{busy===product.id?'Restoring…':'Restore'}</button></div>)}</div>:<div className="empty"><span className="empty-icon"><Package size={25}/></span><h3>{q?'No matching products':'No removed products'}</h3><p>{q?'Try another name or barcode.':'Products you remove will appear here.'}</p></div>}
 </div>;
}
