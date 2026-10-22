import {Capacitor} from '@capacitor/core';
export async function saveTextFile(name:string,text:string,mime='text/plain'):Promise<boolean>{
 const safe=name.replace(/[^a-z0-9._-]/gi,'-');
 if(Capacitor.isNativePlatform()){
  const [{Filesystem,Directory,Encoding},{Share}]=await Promise.all([import('@capacitor/filesystem'),import('@capacitor/share')]);
  const file=await Filesystem.writeFile({path:`exports/${Date.now()}-${safe}`,data:text,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
  try{await Share.share({title:safe,dialogTitle:'Save or share export',files:[file.uri]});return true;}catch(e){if(/cancel|dismiss/i.test(String((e as Error).message)))return false;throw new Error('Could not share the file. Try again.');}
 }
 const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download=safe;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
}
export function csvText(rows:(string|number)[][]){return '\ufeff'+rows.map(row=>row.map(value=>`"${(typeof value==='string'&&/^\s*[=+@-]/.test(value)?"'"+value:String(value)).replaceAll('"','""')}"`).join(',')).join('\r\n');}
export async function exportCsv(name:string,rows:(string|number)[][]){try{return await saveTextFile(name,csvText(rows),'text/csv');}catch(e){document.dispatchEvent(new CustomEvent('adfirm-export-error',{detail:(e as Error).message}));return false;}}
export async function exportPendingJson(items:unknown[]){try{return await saveTextFile('adfirm-pending-sales.json',JSON.stringify(items,null,2),'application/json');}catch(e){document.dispatchEvent(new CustomEvent('adfirm-export-error',{detail:(e as Error).message}));return false;}}
