import Dexie, {type EntityTable} from 'dexie';
import {Capacitor} from '@capacitor/core';
import type {Session,Snapshot,QueueItem,Receipt} from './types';

const configured=(import.meta as ImportMeta&{env:Record<string,string>}).env.VITE_API_URL;
export const native=Capacitor.isNativePlatform();
export function apiBase(){return configured||localStorage.getItem('adfirm-api-url')||(native?'':'/api');}
export function setApiBase(value:string){const url=new URL(value),env=(import.meta as ImportMeta&{env:Record<string,unknown>}).env;if(url.protocol!=='https:'&&!(url.protocol==='http:'&&(env.DEV||env.VITE_ALLOW_HTTP==='true')))throw new Error('Use an HTTPS API URL');if(!url.pathname.endsWith('/api'))throw new Error('API address must end with /api');localStorage.setItem('adfirm-api-url',value.replace(/\/$/,''));}
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
export async function api<T>(path:string,session:Session|null,options:RequestInit={}):Promise<T>{
 const base=apiBase();if(!base)throw new ApiError(0,'Connect your API first');
 const headers=new Headers(options.headers);if(session)headers.set('Authorization',`Bearer ${session.token}`);if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
 const response=await fetch(base+path,{...options,headers,signal:options.signal||AbortSignal.timeout(15000)});
 if(!response.ok){const body=await response.json().catch(()=>({error:'Request failed'}));throw new ApiError(response.status,body.error||'Request failed');}return response.json();
}
const db=new Dexie('adfirm-pos-v1') as Dexie&{snapshots:EntityTable<{key:string;data:Snapshot},'key'>;outbox:EntityTable<QueueItem,'id'>;receipts:EntityTable<Receipt,'id'>;images:EntityTable<{key:string;scope:string;blob:Blob;touched:number},'key'>};
db.version(1).stores({snapshots:'key',outbox:'id,userId,storeId,createdAt',receipts:'id,userId,storeId,occurredAt'});
db.version(2).stores({snapshots:'key',outbox:'id,userId,storeId,createdAt',receipts:'id,userId,storeId,occurredAt',images:'key,scope,touched'});
export function readSession():Session|null{try{return JSON.parse(localStorage.getItem('adfirm-session')||'null');}catch{return null;}}
export function persistSession(session:Session|null){if(session)localStorage.setItem('adfirm-session',JSON.stringify(session));else localStorage.removeItem('adfirm-session');}
export async function pending(session:Session,storeId?:string){return (await db.outbox.where('userId').equals(session.user.id).sortBy('createdAt')).filter(q=>!storeId||q.storeId===storeId);}
export async function snapshot(session:Session,storeId:string):Promise<{data:Snapshot;cached:boolean}>{
 const key=`${session.user.id}:${storeId}`;
 try{const data=await api<Snapshot>(`/stores/${storeId}/snapshot`,session);await db.snapshots.put({key,data});return {data,cached:false};}
 catch(e){if(e instanceof ApiError&&e.status>0&&e.status<500){if(e.status===401||e.status===403){await db.snapshots.delete(key);await db.images.where('scope').equals(key).delete();}throw e;}const cached=await db.snapshots.get(key);if(!cached)throw e;return {data:cached.data,cached:true};}
}
let flushing:Promise<void>|null=null;
export async function flush(session:Session){
 if(flushing){await flushing;return;}
 flushing=(async()=>{for(const item of await pending(session)){try{await api(`/stores/${item.storeId}/sales`,session,{method:'POST',body:JSON.stringify(item.input)});await db.transaction('rw',db.outbox,db.receipts,async()=>{await db.outbox.delete(item.id);await db.receipts.update(item.id,{synced:true});});}catch(e){if(e instanceof ApiError&&e.status>0&&e.status<500){await db.outbox.update(item.id,{error:e.message});continue;}break;}}})();
 try{await flushing;}finally{flushing=null;}
}
export async function saveSale(session:Session,storeId:string,input:QueueItem['input'],receipt:Receipt){
 await db.transaction('rw',db.outbox,db.receipts,async()=>{await db.outbox.add({id:input.id,userId:session.user.id,storeId,input:{...input,offline:true},createdAt:new Date().toISOString()});await db.receipts.add(receipt);});
 await flush(session);return (await db.receipts.get(input.id))!;
}
export async function localReceipts(session:Session,storeId:string){return (await db.receipts.where('userId').equals(session.user.id).toArray()).filter(r=>r.storeId===storeId).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));}
export function isConnectionError(error:unknown){return !(error instanceof ApiError)||error.status===0||error.status>=500;}
export function formatMoney(minor:number){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(minor/100);}
export function toMinor(value:FormDataEntryValue|null){const text=String(value??'');if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('Enter an amount with up to 2 decimals');return Math.round(Number(text)*100);}

export async function reconcilePending(session:Session,item:QueueItem,reason:string){
 await api(`/stores/${item.storeId}/sales/reconcile`,session,{method:'POST',body:JSON.stringify({sale:item.input,reason})});
 await db.transaction('rw',db.outbox,db.receipts,async()=>{await db.outbox.delete(item.id);await db.receipts.update(item.id,{synced:true});});
}

export async function productImage(session:Session,storeId:string,imageId:string):Promise<{url:string;release:()=>void}>{
 const scope=`${session.user.id}:${storeId}`,key=`${scope}:${imageId}`;
 try{const saved=await db.images.get(key);if(saved){const url=URL.createObjectURL(saved.blob);return {url,release:()=>URL.revokeObjectURL(url)};}}catch{}
 const result=await api<{url:string}>(`/stores/${storeId}/images/${imageId}/url`,session);let url=result.url;if(url.startsWith('/api')&&apiBase()!=='/api')url=apiBase().replace(/\/api$/,'')+url;
 try{const response=await fetch(url,{signal:AbortSignal.timeout(5000)});if(response.ok){const blob=await response.blob();if(blob.type.startsWith('image/webp')&&blob.size<=200*1024){await db.images.put({key,scope,blob,touched:Date.now()});const rows=await db.images.where('scope').equals(scope).sortBy('touched');if(rows.length>50)await db.images.bulkDelete(rows.slice(0,rows.length-50).map(r=>r.key));const local=URL.createObjectURL(blob);return {url:local,release:()=>URL.revokeObjectURL(local)};}}}catch{}
 return {url,release:()=>{}};
}
