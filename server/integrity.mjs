export async function checkIntegrity(db){
 const failures=[];
 if(db.kind==='sqlite'){
  const rows=await db.all('PRAGMA integrity_check');if(rows.some(r=>r.integrity_check!=='ok'))failures.push('SQLite integrity check failed');
  if((await db.all('PRAGMA foreign_key_check')).length)failures.push('Foreign key violations');
 }
 const journals=await db.all('SELECT source_type,source_id,SUM(debit_minor-credit_minor) AS n FROM journals GROUP BY source_type,source_id HAVING SUM(debit_minor-credit_minor)<>0');if(journals.length)failures.push(`${journals.length} unbalanced journal groups`);
 const stores=await db.all('SELECT id,name FROM stores');const results=[];
 for(const s of stores){const inventory=Number((await db.get('SELECT COALESCE(SUM(stock_value_minor),0) AS n FROM products WHERE store_id=?',[s.id])).n),receivables=Number((await db.get('SELECT COALESCE(SUM(balance_minor),0) AS n FROM customers WHERE store_id=?',[s.id])).n);
  const accounts=await db.all("SELECT account,SUM(debit_minor-credit_minor) AS n FROM journals WHERE store_id=? AND account IN ('inventory','receivables') GROUP BY account",[s.id]);
  const inventoryDifference=inventory-Number(accounts.find(a=>a.account==='inventory')?.n||0),receivableDifference=receivables-Number(accounts.find(a=>a.account==='receivables')?.n||0);
  if(inventoryDifference||receivableDifference)failures.push(`Store ${s.id}: ledger/detail mismatch`);results.push({storeId:s.id,inventoryDifferenceMinor:inventoryDifference,receivableDifferenceMinor:receivableDifference});
 }
 return {ok:failures.length===0,failures,stores:results};
}
