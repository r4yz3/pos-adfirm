import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync} from 'node:fs';
import {openDatabase} from '../database.mjs';
import {buildApp} from '../app.mjs';

// Needs a build (npm run build); deploys always build before starting the server.
test('built web app is served with offline-friendly cache headers',{skip:!existsSync('dist/index.html')&&'run npm run build first'},async()=>{
 const db=await openDatabase({path:':memory:',url:null});const app=await buildApp({db});
 try{
  const page=await app.inject({method:'GET',url:'/'});assert.equal(page.statusCode,200);assert.equal(page.headers['cache-control'],'no-cache');assert.match(page.body,/manifest\.webmanifest/);assert.match(page.body,/apple-touch-icon/);
  const deepLink=await app.inject({method:'GET',url:'/products'});assert.equal(deepLink.statusCode,200);assert.equal(deepLink.headers['cache-control'],'no-cache');
  const worker=await app.inject({method:'GET',url:'/sw.js'});assert.equal(worker.statusCode,200);assert.equal(worker.headers['cache-control'],'no-cache');assert.match(worker.body,/adfirm-pos-[0-9a-f]{12}/);assert.doesNotMatch(worker.body,/__FILES__|__VERSION__/);
  const manifest=await app.inject({method:'GET',url:'/manifest.webmanifest'});assert.equal(manifest.statusCode,200);assert.equal(manifest.json().display,'standalone');
  const asset=readdirSync('dist/assets').find(name=>name.endsWith('.js'));const built=await app.inject({method:'GET',url:`/assets/${asset}`});assert.equal(built.statusCode,200);assert.match(built.headers['cache-control'],/immutable/);
  assert.match(worker.body,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal((await app.inject({method:'GET',url:'/apple-touch-icon.png'})).statusCode,200);
  // A missing build file must never come back as the app page, or an offline copy could save HTML as code.
  assert.equal((await app.inject({method:'GET',url:'/assets/index-missing.js'})).statusCode,404);
 }finally{await app.close();await db.close();}
});
