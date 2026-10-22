import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
pg.types.setTypeParser(20,value=>Number(value));

const schema = `
CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS financial_commands (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), name TEXT NOT NULL, location TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS installations (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),store_id TEXT REFERENCES stores(id),platform TEXT NOT NULL,app_version TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS installation_seen ON installations(platform,last_seen);
CREATE TABLE IF NOT EXISTS store_subscriptions (store_id TEXT PRIMARY KEY REFERENCES stores(id),status TEXT NOT NULL,period_ends_at TEXT,reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS store_settings (store_id TEXT PRIMARY KEY REFERENCES stores(id),sales_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sales_enabled IN (0,1)));
CREATE TABLE IF NOT EXISTS recognition_usage (store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(store_id,day));
CREATE TABLE IF NOT EXISTS memberships (user_id TEXT NOT NULL REFERENCES users(id), store_id TEXT NOT NULL REFERENCES stores(id), role TEXT NOT NULL, PRIMARY KEY(user_id,store_id));
CREATE TABLE IF NOT EXISTS staff_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id),business_id TEXT NOT NULL REFERENCES businesses(id));
CREATE TABLE IF NOT EXISTS money_movements (id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),payment_method TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS money_store_date ON money_movements(store_id,created_at);
CREATE TABLE IF NOT EXISTS cash_closings (id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),day TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),expected_minor INTEGER NOT NULL,counted_minor INTEGER NOT NULL,variance_minor INTEGER NOT NULL,note TEXT NOT NULL,journal_count INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(store_id,day));
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_expiry ON sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), name TEXT NOT NULL, barcode TEXT, category TEXT NOT NULL, unit TEXT NOT NULL, price_minor INTEGER NOT NULL CHECK(price_minor>=0), cost_minor INTEGER NOT NULL CHECK(cost_minor>=0), stock_milli INTEGER NOT NULL, low_stock_milli INTEGER NOT NULL DEFAULT 5000, image_id TEXT, updated_at TEXT NOT NULL, UNIQUE(store_id,barcode), UNIQUE(id,store_id));
CREATE TABLE IF NOT EXISTS stock_transfers (id TEXT PRIMARY KEY,source_store_id TEXT NOT NULL REFERENCES stores(id),target_store_id TEXT NOT NULL REFERENCES stores(id),source_product_id TEXT NOT NULL REFERENCES products(id),target_product_id TEXT NOT NULL REFERENCES products(id),quantity_milli INTEGER NOT NULL,value_minor INTEGER NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS transfers_source ON stock_transfers(source_store_id,created_at);
CREATE INDEX IF NOT EXISTS transfers_target ON stock_transfers(target_store_id,created_at);
CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),name TEXT NOT NULL,phone TEXT NOT NULL,UNIQUE(id,store_id),UNIQUE(store_id,name));
CREATE TABLE IF NOT EXISTS purchase_invoices (id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),supplier_id TEXT NOT NULL,reference TEXT NOT NULL,due_day TEXT,total_minor INTEGER NOT NULL CHECK(total_minor>0),paid_minor INTEGER NOT NULL DEFAULT 0 CHECK(paid_minor>=0 AND paid_minor<=total_minor),created_at TEXT NOT NULL,UNIQUE(id,store_id),UNIQUE(store_id,supplier_id,reference),FOREIGN KEY(supplier_id,store_id) REFERENCES suppliers(id,store_id));
CREATE TABLE IF NOT EXISTS purchase_lines (id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL,store_id TEXT NOT NULL,product_id TEXT NOT NULL,name TEXT NOT NULL,quantity_milli INTEGER NOT NULL,unit_cost_minor INTEGER NOT NULL,total_minor INTEGER NOT NULL,FOREIGN KEY(invoice_id,store_id) REFERENCES purchase_invoices(id,store_id),FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id));
CREATE TABLE IF NOT EXISTS supplier_payments (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),payment_method TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(invoice_id,store_id) REFERENCES purchase_invoices(id,store_id));
CREATE INDEX IF NOT EXISTS invoices_supplier ON purchase_invoices(store_id,supplier_id);
CREATE INDEX IF NOT EXISTS purchase_lines_invoice ON purchase_lines(store_id,invoice_id);
CREATE INDEX IF NOT EXISTS supplier_payments_invoice ON supplier_payments(store_id,invoice_id);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', balance_minor INTEGER NOT NULL DEFAULT 0, UNIQUE(id,store_id));
CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), user_id TEXT NOT NULL REFERENCES users(id), request_hash TEXT NOT NULL, total_minor INTEGER NOT NULL, cost_minor INTEGER NOT NULL, payment_method TEXT NOT NULL, cash_minor INTEGER NOT NULL, customer_id TEXT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed', FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id), UNIQUE(id,store_id));
CREATE TABLE IF NOT EXISTS sale_lines (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, store_id TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, quantity_milli INTEGER NOT NULL, price_minor INTEGER NOT NULL, cost_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, FOREIGN KEY(sale_id,store_id) REFERENCES sales(id,store_id), FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id));
CREATE TABLE IF NOT EXISTS sale_returns (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,sale_id TEXT NOT NULL,amount_minor INTEGER NOT NULL,cost_minor INTEGER NOT NULL,credit_cancel_minor INTEGER NOT NULL,refund_method TEXT NOT NULL,restock INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(sale_id,store_id) REFERENCES sales(id,store_id));
CREATE TABLE IF NOT EXISTS sale_return_lines (id TEXT PRIMARY KEY,return_id TEXT NOT NULL REFERENCES sale_returns(id),sale_line_id TEXT NOT NULL REFERENCES sale_lines(id),quantity_milli INTEGER NOT NULL,amount_minor INTEGER NOT NULL,cost_minor INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS return_line_source ON sale_return_lines(sale_line_id);
CREATE INDEX IF NOT EXISTS returns_sale ON sale_returns(store_id,sale_id);
CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), category TEXT NOT NULL, note TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0), payment_method TEXT NOT NULL, occurred_at TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), product_id TEXT NOT NULL, quantity_milli INTEGER NOT NULL, type TEXT NOT NULL, source_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id));
CREATE TABLE IF NOT EXISTS journals (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), source_type TEXT NOT NULL, source_id TEXT NOT NULL, account TEXT NOT NULL, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), customer_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0), created_at TEXT NOT NULL, FOREIGN KEY(customer_id,store_id) REFERENCES customers(id,store_id));
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), object_key TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platform_settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, store_id TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hardware_orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), user_id TEXT NOT NULL, product_name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sales_store_date ON sales(store_id,occurred_at);
CREATE INDEX IF NOT EXISTS expense_store_date ON expenses(store_id,occurred_at);
CREATE INDEX IF NOT EXISTS journal_store ON journals(store_id,created_at);
CREATE INDEX IF NOT EXISTS product_store ON products(store_id);
CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(sale_id);
CREATE INDEX IF NOT EXISTS customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS sales_store_created ON sales(store_id,created_at);
CREATE INDEX IF NOT EXISTS journal_source ON journals(source_type,source_id);
CREATE INDEX IF NOT EXISTS stock_product ON stock_movements(store_id,product_id,created_at);
`;

export async function openDatabase({url=process.env.DATABASE_URL,path=process.env.SQLITE_PATH||'./data/adfirm.sqlite'}={}) {
  let sqlite, pool, tail=Promise.resolve();
  if(url) pool=new pg.Pool({connectionString:url,max:10});
  else {if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');}
  const executor = client => ({
    async all(sql,params=[]){if(pool){let n=0;return (await client.query(sql.replace(/\?/g,()=>`$${++n}`),params)).rows;}return sqlite.prepare(sql).all(...params);},
    async get(sql,params=[]){return (await this.all(sql,params))[0];},
    async run(sql,params=[]){if(pool){let index=0;return client.query(sql.replace(/\?/g,()=>`$${++index}`),params);}return sqlite.prepare(sql).run(...params);}
  });
  // Each invocation gets an independent placeholder counter, including parallel reads.
  const raw=executor(pool);
  raw.all=async(sql,params=[])=>{if(pool){let n=0;return (await pool.query(sql.replace(/\?/g,()=>`$${++n}`),params)).rows;}await tail;return sqlite.prepare(sql).all(...params);};
  const db={...raw,kind:pool?'postgres':'sqlite',
    async tx(fn){
      if(pool){const client=await pool.connect();try{await client.query('BEGIN');const tx=executor(client);tx.all=async(sql,params=[])=>{let n=0;return (await client.query(sql.replace(/\?/g,()=>`$${++n}`),params)).rows;};const value=await fn(tx);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
      let release;const previous=tail;tail=new Promise(resolve=>{release=resolve;});await previous;
      try{sqlite.exec('BEGIN IMMEDIATE');const result=await fn(executor(null));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}finally{release();}
    },
    async close(){if(pool)await pool.end();else sqlite.close();}
  };
  if(pool)await pool.query(schema.replaceAll(' INTEGER',' BIGINT'));else sqlite.exec(schema);
  const columns=pool?(await pool.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='products'")).rows:sqlite.prepare('PRAGMA table_info(products)').all();
  if(!columns.some(c=>c.name==='stock_value_minor')){
    await db.run(`ALTER TABLE products ADD COLUMN stock_value_minor ${pool?'BIGINT':'INTEGER'} NOT NULL DEFAULT 0`);
    await db.run('UPDATE products SET stock_value_minor=CAST(ROUND(cost_minor*stock_milli/1000.0) AS BIGINT)');
  }
  const lineColumns=pool?(await pool.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='sale_lines'")).rows:sqlite.prepare('PRAGMA table_info(sale_lines)').all();
  if(!lineColumns.some(c=>c.name==='allocated_cost_minor'))await db.run(`ALTER TABLE sale_lines ADD COLUMN allocated_cost_minor ${pool?'BIGINT':'INTEGER'}`);
  // Adopt existing cashiers only when every membership belongs to one business.
  await db.run("INSERT INTO staff_accounts(user_id,business_id) SELECT u.id,MIN(s.business_id) FROM users u JOIN memberships m ON m.user_id=u.id JOIN stores s ON s.id=m.store_id WHERE u.role='cashier' AND NOT EXISTS(SELECT 1 FROM staff_accounts a WHERE a.user_id=u.id) GROUP BY u.id HAVING COUNT(DISTINCT s.business_id)=1 ON CONFLICT(user_id) DO NOTHING");
  return db;
}
