import {useEffect,useState,type ReactNode} from 'react';
import {ArrowRight,Check,ChevronDown,Copy,Download,Laptop,MonitorDown,Share,ShieldCheck,Smartphone,SquarePlus,TabletSmartphone,X} from 'lucide-react';
import {api,apiBase,native} from './api';
import {ios,installed,useInstallPrompt} from './InstallGuide';

type Release={versionName:string;versionCode:number;size:number;sha256:string;publishedAt:string;url:string};
type Device='android'|'apple'|'computer';
const android=()=>/Android/i.test(navigator.userAgent);
const megabytes=(bytes:number)=>`${(bytes/1048576).toFixed(1)} MB`;
// Absolute so the native app (served from localhost) downloads from the real server.
const downloadUrl=(release:Release)=>new URL(release.url,new URL(apiBase(),location.href)).toString();

function useAndroidRelease(){
 const [release,setRelease]=useState<Release|null>(null),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let active=true;api<Release>('/app/android',null).then(r=>{if(active)setRelease(r);}).catch(()=>{}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[]);
 return {release,loaded};
}

function Steps({items}:{items:[ReactNode,string,ReactNode][]}){
 return <ol className="install-steps">{items.map(([icon,title,detail],i)=><li key={title}><span>{icon??i+1}</span><div><b>{title}</b><small>{detail}</small></div></li>)}</ol>;
}

// Every way to get the app, with the visitor's own device first and its main action ready.
export default function GetAppPanel({id}:{id?:string}){
 const {release,loaded}=useAndroidRelease(),install=useInstallPrompt();
 const here:Device=android()?'android':ios()?'apple':'computer';
 const [open,setOpen]=useState<Device|null>(null),[copied,setCopied]=useState(false);
 if(native)return null;
 const link=`${location.origin}/download/android`;
 const devices=(['android','apple','computer'] as Device[]).filter(d=>d!=='android'||release||!loaded).sort((a,b)=>Number(b===here)-Number(a===here));
 const toggle=(d:Device)=>setOpen(o=>o===d?null:d);
 async function copy(){try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setOpen('android');}}
 const tile=(d:Device)=>{
  const current=d===here,done=current&&installed()&&d!=='android',expanded=open===d;
  const how=<button type="button" className="button secondary small" aria-expanded={expanded} onClick={()=>toggle(d)}>How to <ChevronDown size={14}/></button>;
  let icon=<Smartphone size={20}/>,title='Android phone',detail='',action:ReactNode=how,body:ReactNode=null;
  if(d==='android'){
   detail=release?`App · Version ${release.versionName} · ${megabytes(release.size)}`:'Checking the latest version…';
   action=release&&(current?<a className="button small" href={downloadUrl(release)} download><Download size={14}/> Download</a>:<button type="button" className="button secondary small" onClick={()=>void copy()}>{copied?<><Check size={14}/> Copied</>:<><Copy size={14}/> Copy link</>}</button>);
   body=release&&<>{!current&&<p className="get-app-link-hint">On your Android phone, open <b>{link.replace(/^https?:\/\//,'')}</b></p>}<Steps items={[[null,'Download the app',current?'Tap Download, then open the file when it finishes.':'Open the link above on your phone and tap Download.'],[null,'Allow the install','If your phone asks, allow your browser to “Install unknown apps”, then go back.'],[null,'Install and sign in','Tap Install, then Open. Sign in with your store account.']]}/><p className="android-download-meta"><ShieldCheck size={13}/> Signed by Adfirm · SHA-256 {release.sha256.slice(0,12)}…</p></>;
  }
  if(d==='apple'){
   icon=<TabletSmartphone size={20}/>;title='iPhone & iPad';detail='Add to Home Screen from Safari';
   body=<Steps items={[[<Share size={16}/>,'Open in Safari, tap Share',`Visit ${location.host} in Safari, then tap the square with an arrow.`],[<SquarePlus size={16}/>,'Choose “Add to Home Screen”','Scroll the menu if you don’t see it.'],[<Check size={16}/>,'Tap Add','Open the app from your Home Screen. It works offline after the first sign-in.']]}/>;
  }
  if(d==='computer'){
   icon=<Laptop size={20}/>;title=current?'This computer':'Computer';detail='Install as a desktop app';
   if(current&&install.available)action=<button type="button" className="button small" onClick={()=>void install.prompt()}><MonitorDown size={14}/> Install</button>;
   body=<Steps items={[[<MonitorDown size={16}/>,'Chrome or Edge','Click the install icon at the right end of the address bar, or open the browser menu and choose Install.'],[<Laptop size={16}/>,'Safari on Mac','Choose File, then Add to Dock.'],[<Check size={16}/>,'Open it like any app','It opens in its own window and keeps working offline.']]}/>;
  }
  if(done)action=<span className="get-app-installed"><Check size={14}/> Installed</span>;
  return <li key={d} className={`get-app-option${current?' current':''}${expanded?' open':''}`}>
   <div className="get-app-row"><span className="get-app-icon">{icon}</span><div><b>{title}{current&&<em>This device</em>}</b><small>{detail}</small></div>{action}</div>
   {d==='android'&&release&&!expanded&&<button type="button" className="get-app-more" onClick={()=>toggle(d)}>How to install <ChevronDown size={13}/></button>}
   {expanded&&<div className="get-app-body">{body}</div>}
  </li>;
 };
 return <section className="get-app" id={id} aria-label="Get the app"><div className="get-app-head"><span className="eyebrow">GET THE APP</span><h3>Use POS on any device</h3><p>Install it for full screen and offline selling.</p></div><ul>{devices.map(tile)}</ul></section>;
}

// Shown inside the Android app when a newer version has been published.
export function UpdateNotice(){
 const {release}=useAndroidRelease(),[closed,setClosed]=useState(false);
 if(!native||closed||!release||release.versionCode<=__APP_VERSION_CODE__)return null;
 return <div className="update-notice" role="status"><Download size={17}/><span><b>Update available</b> Version {release.versionName} is ready to install.</span><button type="button" className="button small" onClick={()=>{location.href=downloadUrl(release);}}>Update <ArrowRight size={14}/></button><button type="button" className="icon-button" onClick={()=>setClosed(true)} aria-label="Later"><X size={15}/></button></div>;
}
