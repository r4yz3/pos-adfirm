import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {Laptop,LogOut,Smartphone,TabletSmartphone} from 'lucide-react';
import {api} from './api';
import type {Session} from './types';

type Device={id:string;device:string;signedInAt:string|null;lastActiveAt:string|null;current:boolean};
const deviceIcon=(name:string)=>/iPad/.test(name)?TabletSmartphone:/Android|iPhone/.test(name)?Smartphone:Laptop;
function ago(at:string|null){
 if(!at)return 'a while ago';const minutes=Math.round((Date.now()-Date.parse(at))/60000);
 if(minutes<10)return 'just now';if(minutes<60)return `${minutes} min ago`;const hours=Math.round(minutes/60);if(hours<24)return `${hours} hr ago`;
 return new Date(at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'});
}

export default function Account({session}:{session:Session}){
 const [mode,setMode]=useState<'password'|'sessions'|null>(null),[devices,setDevices]=useState<Device[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(async()=>{try{setDevices((await api<{devices:Device[]}>('/auth/devices',session)).devices);}catch(e){setError((e as Error).message);}},[session]);
 useEffect(()=>{void load();},[load]);
 async function signOutDevice(device:Device){setBusy(device.id);setError('');setMessage('');try{await api(`/auth/devices/${device.id}`,session,{method:'DELETE'});setDevices(list=>list?.filter(d=>d.id!==device.id)||null);setMessage(`${device.device} signed out.`);}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);setError('');setMessage('');if(mode==='password'&&f.get('newPassword')!==f.get('confirmPassword')){setError('New passwords do not match');return;}
 setBusy('form');try{const body=mode==='password'?{currentPassword:f.get('currentPassword'),newPassword:f.get('newPassword')}:{currentPassword:f.get('currentPassword')};await api(mode==='password'?'/auth/password':'/auth/revoke-others',session,{method:'POST',body:JSON.stringify(body)});form.reset();setDevices(list=>list?.filter(d=>d.current)||null);setMode(null);setMessage(mode==='password'?'Password changed. Other devices signed out.':'Other devices signed out.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const others=devices?.filter(d=>!d.current).length||0;
 return <div className="account-security"><p className="account-email">{session.user.email}</p>{session.demo&&<p className="fineprint">Demo mode: quick sign-in remains enabled.</p>}
  {error&&<div className="alert error" role="alert">{error}</div>}{message&&<p className="finance-note" role="status">{message}</p>}
  <section className="devices"><div className="devices-head"><h3>Signed-in devices</h3><span className="count-badge">{devices?devices.length:'…'}</span></div>
   <p className="fineprint">Use this account on as many phones, tablets and computers as you need. Each stays signed in for 30 days after it was last used.</p>
   {devices===null?<p className="fineprint">Loading devices…</p>:<ul>{devices.map(d=>{const Icon=deviceIcon(d.device);return <li key={d.id} className={d.current?'current':''}><span className="device-icon"><Icon size={19}/></span><div><b>{d.device}{d.current&&<em>This device</em>}</b><small>Active {ago(d.lastActiveAt)}{d.signedInAt?` · Signed in ${new Date(d.signedInAt).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'})}`:''}</small></div>{!d.current&&<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void signOutDevice(d)}><LogOut size={14}/>{busy===d.id?'Signing out…':'Sign out'}</button>}</li>;})}</ul>}
  </section>
  {!mode?<div className="account-actions"><button className="button" onClick={()=>{setMode('password');setError('');setMessage('');}}>Change password</button>{others>0&&<button className="button secondary" onClick={()=>{setMode('sessions');setError('');setMessage('');}}>Sign out all other devices</button>}</div>:<form onSubmit={e=>void save(e)}><h3>{mode==='password'?'Change password':'Sign out all other devices'}</h3><label className="field">Current password<input name="currentPassword" type="password" required maxLength={256} autoComplete="current-password" disabled={!!busy}/></label>{mode==='password'&&<><label className="field">New password<input name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={!!busy}/></label><label className="field">Confirm new password<input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={!!busy}/></label><p className="fineprint">At least 12 characters. Other devices will be signed out.</p></>}<div className="account-actions"><button className="button" disabled={!!busy}>{busy?'Saving…':mode==='password'?'Save password':'Confirm sign out'}</button><button type="button" className="button secondary" disabled={!!busy} onClick={()=>{setMode(null);setError('');}}>Cancel</button></div><p className="fineprint">This device stays signed in. Sales saved on other devices stay there and sync after they sign in again.</p></form>}
 </div>;
}
