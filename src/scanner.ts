// Barcode decoding for the web app. Uses the browser's built-in BarcodeDetector where it exists (Chrome on
// Android and Mac) and ZXing-C++ (WebAssembly, served from this app, so it also works offline) everywhere else.
import {prepareZXingModule,readBarcodes,type ReaderOptions} from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

type Detector={detect:(source:CanvasImageSource|Blob|ImageData)=>Promise<{rawValue:string}[]>};
const retail=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'];
const options:ReaderOptions={formats:['EAN13','EAN8','UPCA','UPCE','Code128','Code39','ITF','QRCode'],tryHarder:true,tryRotate:true,tryInvert:false,tryDownscale:true,maxNumberOfSymbols:1};

let zxing:Promise<unknown>|null=null,detector:Promise<Detector|null>|null=null;
const loadZxing=()=>zxing??=Promise.resolve(prepareZXingModule({overrides:{locateFile:(path:string,prefix:string)=>path.endsWith('.wasm')?wasmUrl:prefix+path},fireImmediately:true}));
function nativeDetector(){
 return detector??=(async()=>{
  const Native=(window as Window&{BarcodeDetector?:{new(o:{formats:string[]}):Detector;getSupportedFormats():Promise<string[]>}}).BarcodeDetector;
  if(!Native)return null;
  try{const formats=(await Native.getSupportedFormats()).filter(f=>retail.includes(f));return formats.includes('ean_13')?new Native({formats}):null;}catch{return null;}
 })();
}

/** Starts loading the decoder early so the first scan is instant. */
export function prepareScanner(){void loadZxing();void nativeDetector();}

/** Reads one barcode from a camera frame. Returns '' when nothing is found. */
export async function decodeFrame(canvas:HTMLCanvasElement):Promise<string>{
 const native=await nativeDetector();
 if(native){try{const [hit]=await native.detect(canvas);if(hit?.rawValue)return hit.rawValue.trim();}catch{}}
 await loadZxing();
 const image=canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height);
 const [hit]=await readBarcodes(image,options);
 return hit?.isValid?hit.text.trim():'';
}

/** Reads one barcode from a photo. */
export async function decodeImage(file:Blob):Promise<string>{
 await loadZxing();
 const [hit]=await readBarcodes(file,options);
 return hit?.isValid?hit.text.trim():'';
}
