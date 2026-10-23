import {useEffect,useState} from 'react';
import {Download,MonitorSmartphone,Share,SquarePlus,X} from 'lucide-react';
import {native} from './api';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
const DISMISS_KEY='adfirm-install-dismissed',DISMISS_DAYS=14;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
const installed=()=>matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
const dismissedRecently=()=>{try{return Date.now()-Number(localStorage.getItem(DISMISS_KEY)||0)<DISMISS_DAYS*86400000;}catch{return false;}};

// Chrome-family browsers fire this once per page load, possibly before React mounts.
let deferred:InstallPrompt|null=null;
const listeners=new Set<()=>void>();
if(typeof window!=='undefined'){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e as InstallPrompt;listeners.forEach(l=>l());});window.addEventListener('appinstalled',()=>{deferred=null;listeners.forEach(l=>l());});}

export default function InstallGuide({persistent=false}:{persistent?:boolean}){
 const [, setTick]=useState(0),[hidden,setHidden]=useState(()=>!persistent&&dismissedRecently()),[open,setOpen]=useState(false);
 useEffect(()=>{const update=()=>setTick(t=>t+1);listeners.add(update);return()=>{listeners.delete(update);};},[]);
 if(native||installed()||hidden)return null;
 const apple=ios();if(!apple&&!deferred)return null;
 function dismiss(){try{localStorage.setItem(DISMISS_KEY,String(Date.now()));}catch{}setHidden(true);}
 async function install(){if(!deferred)return;await deferred.prompt();const choice=await deferred.userChoice;if(choice.outcome==='accepted'){deferred=null;setHidden(true);}}
 return <section className={`install-guide${persistent?' persistent':''}`} aria-label="Install POS - For Micro Business">
  <div className="install-guide-head"><img src="/apple-touch-icon.png" alt="" width={44} height={44}/><div><b>Install POS - For Micro Business</b><span className="install-by">by Adfirm</span><small>{apple?'Add it to your Home Screen for a full-screen app that opens offline.':'Install it on this device for a full-screen app that opens offline.'}</small></div>{!persistent&&<button type="button" className="icon-button" onClick={dismiss} aria-label="Dismiss install tip"><X size={16}/></button>}</div>
  {apple?open?<ol className="install-steps"><li><span><Share size={17}/></span><div><b>Tap Share</b><small>The square with an arrow, in Safari’s toolbar.</small></div></li><li><span><SquarePlus size={17}/></span><div><b>Choose “Add to Home Screen”</b><small>Scroll the menu if you don’t see it.</small></div></li><li><span><MonitorSmartphone size={17}/></span><div><b>Tap Add</b><small>Open Adfirm POS from your Home Screen.</small></div></li></ol>:<button type="button" className="button secondary install-action" onClick={()=>setOpen(true)}><Share size={16}/> Show me how</button>
   :<button type="button" className="button install-action" onClick={()=>void install()}><Download size={16}/> Install app</button>}
 </section>;
}
