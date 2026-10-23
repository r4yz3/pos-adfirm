import {useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,Eye,EyeOff,MapPin,Store,UserRound} from 'lucide-react';
import {api,ApiError} from './api';
import type {Session} from './types';

type Details={name:string;email:string;password:string;businessName:string;storeName:string;location:string};

export function PasswordInput({name,value,onChange,placeholder,autoComplete,label='Password'}:{name:string;value?:string;onChange?:(value:string)=>void;placeholder:string;autoComplete:string;label?:string}){
 const [shown,setShown]=useState(false);
 return <label className="field password-field">{label}<span className="password-input"><input name={name} type={shown?'text':'password'} value={value} onChange={onChange&&(e=>onChange(e.target.value))} required placeholder={placeholder} autoComplete={autoComplete} maxLength={128}/><button type="button" className="password-toggle" onClick={()=>setShown(v=>!v)} aria-label={shown?'Hide password':'Show password'} aria-pressed={shown}>{shown?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>;
}

// Strength is guidance only; the server enforces the 12-character minimum.
function strength(password:string){
 if(!password)return {score:0,label:''};
 const variety=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(r=>r.test(password)).length;
 if(password.length<12)return {score:1,label:`${12-password.length} more character${12-password.length===1?'':'s'} needed`};
 if(password.length>=16&&variety>=3)return {score:4,label:'Strong password'};
 return variety>=3||password.length>=16?{score:3,label:'Good password'}:{score:2,label:'Fair · add numbers or symbols'};
}

export default function SignUp({onSignedUp,onSignIn}:{onSignedUp:(session:Session)=>void;onSignIn:()=>void}){
 const [step,setStep]=useState<1|2>(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [details,setDetails]=useState<Details>({name:'',email:'',password:'',businessName:'',storeName:'',location:''});
 const key=useRef(crypto.randomUUID()),meter=strength(details.password);
 const set=(field:keyof Details)=>(value:string)=>setDetails(d=>({...d,[field]:value}));
 function next(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');if(details.password.length<12){setError('Use at least 12 characters for your password.');return;}setStep(2);}
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
  const body={id:key.current,name:details.name.trim(),email:details.email.trim(),password:details.password,businessName:details.businessName.trim(),...(details.storeName.trim()?{storeName:details.storeName.trim()}:{}),location:details.location.trim(),website:String(new FormData(e.currentTarget).get('website')||'')};
  onSignedUp(await api<Session>('/auth/signup',null,{method:'POST',body:JSON.stringify(body)}));
 }catch(err){const message=err instanceof ApiError?err.message:'Cannot connect. Check your internet and try again.';setError(message);if(/email/i.test(message))setStep(1);setBusy(false);}}
 return <div className="signup">
  <span className="eyebrow">CREATE YOUR ACCOUNT</span>
  <h2>{step===1?'Start selling today.':'Tell us about your store.'}</h2>
  <p>{step===1?'Set up your owner account in under a minute.':'You can add branches and staff later.'}</p>
  <ol className="signup-steps" aria-label="Sign-up progress"><li className={step===1?'current':'done'}><span>{step===1?'1':<Check size={13}/>}</span>Your details</li><li className={step===2?'current':''}><span>2</span>Your business</li></ol>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {step===1?<form onSubmit={next}>
   <label className="field">Full name<span className="input-icon"><UserRound size={17}/><input name="name" value={details.name} onChange={e=>set('name')(e.target.value)} required minLength={2} maxLength={100} placeholder="Juan Dela Cruz" autoComplete="name"/></span></label>
   <label className="field">Email<input name="email" type="email" value={details.email} onChange={e=>set('email')(e.target.value)} required maxLength={254} placeholder="you@business.com" autoComplete="email"/></label>
   <PasswordInput name="password" value={details.password} onChange={set('password')} placeholder="At least 12 characters" autoComplete="new-password"/>
   {details.password&&<div className={`password-meter score-${meter.score}`} aria-live="polite"><span><i/><i/><i/><i/></span><small>{meter.label}</small></div>}
   <button className="button" type="submit">Continue <ArrowRight size={17}/></button>
  </form>:<form onSubmit={e=>void create(e)}>
   <label className="field">Business name<span className="input-icon"><Store size={17}/><input name="businessName" value={details.businessName} onChange={e=>set('businessName')(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Aling Nena’s Sari-Sari" autoComplete="organization" autoFocus/></span></label>
   <label className="field">First store name <small className="optional">Optional</small><input name="storeName" value={details.storeName} onChange={e=>set('storeName')(e.target.value)} minLength={2} maxLength={100} placeholder="Main store"/></label>
   <label className="field">Location <small className="optional">Optional</small><span className="input-icon"><MapPin size={17}/><input name="location" value={details.location} onChange={e=>set('location')(e.target.value)} maxLength={100} placeholder="Barangay, City" autoComplete="address-level2"/></span></label>
   <input className="signup-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
   <div className="signup-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>{setError('');setStep(1);}}><ArrowLeft size={17}/> Back</button><button className="button" type="submit" disabled={busy}>{busy?'Creating account…':'Create account'}{!busy&&<ArrowRight size={17}/>}</button></div>
  </form>}
  <ul className="signup-perks"><li><Check size={15}/>No card required</li><li><Check size={15}/>Works offline on Android</li><li><Check size={15}/>Add cashiers anytime</li></ul>
  <p className="auth-switch">Already have an account? <button type="button" className="text-button" onClick={onSignIn}>Sign in</button></p>
 </div>;
}
