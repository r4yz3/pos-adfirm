import {useCallback,useEffect,useRef,useState} from 'react';
import {Camera,Check,CircleAlert,Flashlight,FlashlightOff,ImagePlus,Keyboard,ScanBarcode,X} from 'lucide-react';
import {native} from './api';
import {decodeFrame,decodeImage,prepareScanner} from './scanner';
export const normalizeBarcode=(value:string)=>{const text=value.trim();return /^\d{12}$/.test(text)?'0'+text:text;};
export async function scanNativeBarcode(){
 const {CapacitorBarcodeScanner,CapacitorBarcodeScannerTypeHint,CapacitorBarcodeScannerCameraDirection,CapacitorBarcodeScannerAndroidScanningLibrary}=await import('@capacitor/barcode-scanner');
 const result=await CapacitorBarcodeScanner.scanBarcode({hint:CapacitorBarcodeScannerTypeHint.ALL,cameraDirection:CapacitorBarcodeScannerCameraDirection.BACK,scanInstructions:'Align barcode',scanButton:false,android:{scanningLibrary:CapacitorBarcodeScannerAndroidScanningLibrary.ZXING},cancelButtonAccessibilityLabel:'Cancel scan'});
 return result.ScanResult?.trim()||'';
}
export type ScanFeedback={ok:boolean;message:string;action?:{label:string;run:()=>void}};
type Status='starting'|'scanning'|'denied'|'unavailable'|'photo';

function cameraError(error:unknown):Status{const name=String((error as Error)?.name||error);return /NotAllowed|Security|Permission/i.test(name)?'denied':'unavailable';}
// A short tone and buzz confirm each scan without looking at the screen.
let audio:AudioContext|null=null;
function confirmScan(ok:boolean){
 try{navigator.vibrate?.(ok?40:[30,60,30]);}catch{}
 try{audio??=new AudioContext();const tone=audio.createOscillator(),gain=audio.createGain();tone.frequency.value=ok?1760:440;gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.12);tone.connect(gain).connect(audio.destination);tone.start();tone.stop(audio.currentTime+.13);}catch{}
}

/**
 * Live camera barcode scanner. In single mode the first barcode is returned and the scanner closes;
 * in continuous mode (selling) it stays open and onResult reports what happened to each scan.
 */
export default function BarcodeCapture({onResult,onCancel,continuous=false}:{onResult:(code:string)=>void|ScanFeedback;onCancel:()=>void;continuous?:boolean}){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),photoInput=useRef<HTMLInputElement>(null),lastHit=useRef({code:'',at:0}),done=useRef(false);
 const [status,setStatus]=useState<Status>('starting'),[torch,setTorch]=useState<boolean|null>(null),[flash,setFlash]=useState<'ok'|'warn'|null>(null),[feedback,setFeedback]=useState<ScanFeedback|null>(null),[count,setCount]=useState(0),[manual,setManual]=useState(''),[photoError,setPhotoError]=useState('');
 const onResultRef=useRef(onResult);onResultRef.current=onResult;

 const stopCamera=useCallback(()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;},[]);
 const deliver=useCallback((raw:string,fromCamera=false)=>{
  const code=normalizeBarcode(raw);if(!code||done.current)return;
  if(code.length>80){setPhotoError('Use a product barcode, up to 80 characters.');return;}
  if(!continuous){done.current=true;confirmScan(true);stopCamera();onResultRef.current(code);return;}
  // A barcode held in view counts once; it counts again only after it has left the camera for a moment.
  if(fromCamera){const now=Date.now(),seen=lastHit.current;lastHit.current={code,at:now};if(code===seen.code&&now-seen.at<1200)return;}
  const result=onResultRef.current(code)||{ok:true,message:code};confirmScan(result.ok);setFeedback(result);setFlash(result.ok?'ok':'warn');if(result.ok)setCount(c=>c+1);setTimeout(()=>setFlash(null),450);
 },[continuous,stopCamera]);

 useEffect(()=>{
  let active=true,busy=false,last=0,frame=0;prepareScanner();
  const canvas=document.createElement('canvas');
  (async()=>{
   if(!navigator.mediaDevices?.getUserMedia){setStatus('unavailable');return;}
   try{
    const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
    if(!active){media.getTracks().forEach(t=>t.stop());return;}
    stream.current=media;const track=media.getVideoTracks()[0];
    try{await track.applyConstraints({advanced:[{focusMode:'continuous'} as MediaTrackConstraintSet]});}catch{}
    const caps=(track.getCapabilities?.()||{}) as MediaTrackCapabilities&{torch?:boolean};if(caps.torch)setTorch(false);
    const el=video.current!;el.srcObject=media;await el.play().catch(()=>{});setStatus('scanning');
    const tick=async(now:number)=>{
     if(!active)return;frame=requestAnimationFrame(t=>void tick(t));
     if(busy||now-last<140||el.readyState<2||!el.videoWidth)return;busy=true;last=now;
     try{
      // Read the band behind the on-screen scan window, at up to 1280px wide.
      const sw=el.videoWidth*.9,sh=el.videoHeight*.6,sx=(el.videoWidth-sw)/2,sy=(el.videoHeight-sh)/2,scale=Math.min(1,1280/sw);
      canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale);
      canvas.getContext('2d',{willReadFrequently:true})!.drawImage(el,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
      const code=await decodeFrame(canvas);if(code&&active)deliver(code,true);
     }catch{}finally{busy=false;}
    };
    frame=requestAnimationFrame(t=>void tick(t));
   }catch(e){if(active)setStatus(cameraError(e));}
  })();
  return()=>{active=false;cancelAnimationFrame(frame);stopCamera();};
 },[deliver,stopCamera]);

 async function toggleTorch(){const track=stream.current?.getVideoTracks()[0];if(!track||torch===null)return;try{await track.applyConstraints({advanced:[{torch:!torch} as MediaTrackConstraintSet]});setTorch(!torch);}catch{setTorch(null);}}
 async function photo(file?:File){if(!file)return;setPhotoError('');try{const code=await decodeImage(file);if(code)deliver(code);else setPhotoError('No barcode found in that photo. Hold the phone steady and fill the frame with the barcode.');}catch{setPhotoError('Could not read that photo. Try again or type the barcode.');}finally{if(photoInput.current)photoInput.current.value='';}}
 function submitManual(){if(!manual.trim())return;deliver(manual);setManual('');}

 const message=status==='denied'?'Camera access is blocked. Allow the camera for this site in your browser settings, then reopen the scanner.':status==='unavailable'?'No camera is available here. Use a barcode photo or type the number below.':null;
 return <section className={`scanner${continuous?' continuous':''}`} aria-label="Barcode scanner">
  <div className="scanner-head"><h3><ScanBarcode size={20}/> {continuous?'Scan to sell':'Scan barcode'}</h3><button type="button" className="icon-button" aria-label="Close scanner" onClick={()=>{stopCamera();onCancel();}}><X size={20}/></button></div>
  <div className={`scanner-stage${flash?` flash-${flash}`:''}`}>
   <video ref={video} playsInline muted autoPlay aria-hidden="true"/>
   {status==='scanning'&&<><div className="scanner-window" aria-hidden="true"><i/><i/><i/><i/><span className="scanner-laser"/></div><p className="scanner-hint">{continuous?'Scan items one after another':'Point the camera at the barcode'}</p>{torch!==null&&<button type="button" className="scanner-torch" onClick={()=>void toggleTorch()} aria-label={torch?'Turn flashlight off':'Turn flashlight on'} aria-pressed={torch}>{torch?<FlashlightOff size={19}/>:<Flashlight size={19}/>}</button>}</>}
   {status==='starting'&&<div className="scanner-placeholder"><Camera size={30}/><span>Opening camera…</span></div>}
   {message&&<div className="scanner-placeholder"><CircleAlert size={30}/><span>{message}</span></div>}
  </div>
  {continuous&&feedback&&<div className={`scanner-feedback ${feedback.ok?'ok':'warn'}`} role="status">{feedback.ok?<Check size={17}/>:<CircleAlert size={17}/>}<span>{feedback.message}</span>{feedback.action&&<button type="button" className="text-button" onClick={()=>{stopCamera();feedback.action!.run();}}>{feedback.action.label}</button>}</div>}
  {photoError&&<div className="alert error" role="alert">{photoError}</div>}
  <div className="scanner-tools">
   <button type="button" className="button secondary" onClick={()=>photoInput.current?.click()}><ImagePlus size={17}/> Barcode photo</button>
   <input ref={photoInput} hidden type="file" accept="image/*" capture="environment" onChange={e=>void photo(e.target.files?.[0])}/>
   <label className="scanner-manual"><Keyboard size={17}/><input aria-label="Enter barcode" inputMode="numeric" autoComplete="off" placeholder="Type barcode" value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submitManual();}}}/><button type="button" className="button small" disabled={!manual.trim()} onClick={submitManual}>Use</button></label>
  </div>
  {continuous&&<button type="button" className="button full-width scanner-done" onClick={()=>{stopCamera();onCancel();}}>{count?`Done · ${count} item${count===1?'':'s'} added`:'Done'}</button>}
 </section>;
}
export function BarcodeField({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const [scanning,setScanning]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function scan(){setError('');if(!native){setScanning(true);return;}setBusy(true);try{const code=await scanNativeBarcode();if(code)onChange(normalizeBarcode(code));}catch(e){if(!/cancel/i.test(String((e as Error).message)))setError('Allow camera access, then try scanning again.');}finally{setBusy(false);}}
 return <div className="barcode-field"><label className="field">Barcode<div className="barcode-input"><input name="barcode" aria-label="Barcode" value={value} onChange={e=>onChange(e.target.value)} autoComplete="off" placeholder="Scan or enter" maxLength={80} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}}/><button type="button" className="button secondary" aria-label="Scan product barcode" disabled={busy} onClick={()=>void scan()}><ScanBarcode size={19}/> Scan</button></div></label>{error&&<p role="alert" className="negative">{error}</p>}{scanning&&<BarcodeCapture onCancel={()=>setScanning(false)} onResult={code=>{onChange(code);setScanning(false);}}/>}</div>;
}
