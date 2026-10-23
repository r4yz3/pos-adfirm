import {useEffect,useState} from 'react';
import {ArrowRight,ChevronDown,Download,ShieldCheck,Smartphone,X} from 'lucide-react';
import {api,apiBase,native} from './api';
import InstallGuide from './InstallGuide';

type Release={versionName:string;versionCode:number;size:number;sha256:string;publishedAt:string;url:string};
const android=()=>/Android/i.test(navigator.userAgent);
const DISMISS_KEY='adfirm-android-dismissed',DISMISS_DAYS=14;
const dismissedRecently=()=>{try{return Date.now()-Number(localStorage.getItem(DISMISS_KEY)||0)<DISMISS_DAYS*86400000;}catch{return false;}};
const megabytes=(bytes:number)=>`${(bytes/1048576).toFixed(1)} MB`;
const published=(at:string)=>new Date(at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'});
// Absolute so the native app (served from localhost) downloads from the real server.
const downloadUrl=(release:Release)=>new URL(release.url,new URL(apiBase(),location.href)).toString();

function useAndroidRelease(){
 const [release,setRelease]=useState<Release|null>(null),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let active=true;api<Release>('/app/android',null).then(r=>{if(active)setRelease(r);}).catch(()=>{}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
 return {release,loaded};
}

export function AndroidDownload({release,persistent=false,onDismiss}:{release:Release;persistent?:boolean;onDismiss?:()=>void}){
 const [steps,setSteps]=useState(false),onPhone=android();
 return <section className={`android-download${persistent?' persistent':''}`} aria-label="Get the Android app">
  <div className="android-download-head"><span className="android-download-icon"><img src="/icon-192.png" alt="" width={48} height={48}/><i><Smartphone size={13}/></i></span><div><span className="eyebrow">ANDROID APP</span><b>POS - For Micro Business</b><small>by Adfirm · Version {release.versionName} · {megabytes(release.size)}</small></div>{onDismiss&&<button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss Android app tip"><X size={16}/></button>}</div>
  <ul className="android-download-perks"><li>Faster barcode scanning</li><li>Opens offline</li><li>Full screen</li></ul>
  {onPhone?<a className="button android-download-button" href={downloadUrl(release)} download><Download size={17}/> Download for Android</a>
   :<p className="android-download-desktop">On your Android phone, open <b>{location.host}/download/android</b> to install.</p>}
  <button type="button" className="android-download-toggle" aria-expanded={steps} onClick={()=>setSteps(v=>!v)}>How to install <ChevronDown size={15}/></button>
  {steps&&<ol className="install-steps"><li><span>1</span><div><b>Download the app</b><small>Tap Download for Android, then open the file when it finishes.</small></div></li><li><span>2</span><div><b>Allow the install</b><small>If your phone asks, allow your browser to “Install unknown apps”, then go back.</small></div></li><li><span>3</span><div><b>Install and sign in</b><small>Tap Install, then Open. Sign in with your store account.</small></div></li></ol>}
  <p className="android-download-meta"><ShieldCheck size={13}/> Signed by Adfirm · Updated {published(release.publishedAt)}<span title={`SHA-256 ${release.sha256}`}> · SHA-256 {release.sha256.slice(0,12)}…</span></p>
 </section>;
}

// Picks the right "get the app" offer: the Android app on Android, Add to Home Screen on iPhone and other browsers.
export default function GetTheApp({persistent=false}:{persistent?:boolean}){
 const {release,loaded}=useAndroidRelease(),[hidden,setHidden]=useState(()=>!persistent&&dismissedRecently());
 if(native||!loaded)return null;
 if(release&&(android()||persistent)){
  if(hidden)return null;
  const dismiss=persistent?undefined:()=>{try{localStorage.setItem(DISMISS_KEY,String(Date.now()));}catch{}setHidden(true);};
  return <>{<AndroidDownload release={release} persistent={persistent} onDismiss={dismiss}/>}{persistent&&!android()&&<InstallGuide persistent/>}</>;
 }
 return <InstallGuide persistent={persistent}/>;
}

// Shown inside the Android app when a newer version has been published.
export function UpdateNotice(){
 const {release}=useAndroidRelease(),[closed,setClosed]=useState(false);
 if(!native||closed||!release||release.versionCode<=__APP_VERSION_CODE__)return null;
 return <div className="update-notice" role="status"><Download size={17}/><span><b>Update available</b> Version {release.versionName} is ready to install.</span><button type="button" className="button small" onClick={()=>{location.href=downloadUrl(release);}}>Update <ArrowRight size={14}/></button><button type="button" className="icon-button" onClick={()=>setClosed(true)} aria-label="Later"><X size={15}/></button></div>;
}
