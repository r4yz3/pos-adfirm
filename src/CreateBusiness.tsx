import {useRef,useState,type FormEvent} from 'react';
import {Store} from 'lucide-react';
import {api} from './api';
import type {Session} from './types';
export default function CreateBusiness({session,onCreated}:{session:Session;onCreated:(storeId:string)=>Promise<void>}){
 const key=useRef(crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{const r=await api<{storeId:string}>('/businesses',session,{method:'POST',body:JSON.stringify({id:key.current,businessName:f.get('businessName'),storeName:f.get('storeName'),location:f.get('location')||''})});await onCreated(r.storeId);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form onSubmit={e=>void save(e)}>{error&&<p className="alert error" role="alert">{error}</p>}<span className="form-emblem"><Store size={28}/></span><label className="field">Business name<input name="businessName" required minLength={2} maxLength={100} placeholder="e.g. Nena's Store"/></label><label className="field">Store name<input name="storeName" required minLength={2} maxLength={100} placeholder="e.g. Main store"/></label><label className="field">Location<input name="location" maxLength={150} placeholder="City or barangay"/></label><button className="button full-width" disabled={busy}>{busy?'Creating…':'Create business'}</button></form>;
}
