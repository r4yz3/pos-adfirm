import {useState} from 'react';
import {api} from './api';
import type {Session} from './types';
export default function IntegrityPanel({session}:{session:Session}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState<{ok:boolean;failures:string[];stores:unknown[]}|null>(null),[error,setError]=useState('');
 async function check(){setBusy(true);setError('');try{setResult(await api('/admin/integrity',session));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel account-panel"><h2>Record checks</h2><p className="fineprint">Checks journal balance, stock values, customer debt, and local database integrity. Does not alter records.</p>{error&&<div className="alert error">{error}</div>}{result&&<div role="status" className={result.ok?'finance-note':'alert error'}>{result.ok?`Checks passed · ${result.stores.length} stores`:result.failures.join('; ')}</div>}<button className="button secondary" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check records'}</button></section>;
}
