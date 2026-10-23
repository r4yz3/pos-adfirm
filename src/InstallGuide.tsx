import {useEffect,useState} from 'react';

// Device and install-state helpers for the Get the app panel.
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
export const installed=()=>matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;

// Chrome-family browsers fire this once per page load, possibly before React mounts.
let deferred:InstallPrompt|null=null;
const listeners=new Set<()=>void>();
export function useInstallPrompt(){
 const [, setTick]=useState(0);
 useEffect(()=>{const update=()=>setTick(t=>t+1);listeners.add(update);return()=>{listeners.delete(update);};},[]);
 return {available:!!deferred,async prompt(){if(!deferred)return false;await deferred.prompt();const accepted=(await deferred.userChoice).outcome==='accepted';if(accepted)deferred=null;listeners.forEach(l=>l());return accepted;}};
}
if(typeof window!=='undefined'){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e as InstallPrompt;listeners.forEach(l=>l());});window.addEventListener('appinstalled',()=>{deferred=null;listeners.forEach(l=>l());});}
