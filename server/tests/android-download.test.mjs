import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../database.mjs';
import {buildApp} from '../app.mjs';

test('Android app downloads come only from the published release',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'adfirm-downloads-')),db=await openDatabase({path:':memory:',url:null});
 const app=await buildApp({db,downloadsDir:dir});
 try{
  assert.equal((await app.inject({method:'GET',url:'/api/app/android'})).statusCode,404);
  assert.equal((await app.inject({method:'GET',url:'/download/android'})).statusCode,404);
  const apk=Buffer.from('PK fake apk bytes');
  await writeFile(join(dir,'POS-For-Micro-Business-0.4.0.apk'),apk);
  await writeFile(join(dir,'secret.txt'),'not for download');
  await writeFile(join(dir,'android.json'),JSON.stringify({versionName:'0.4.0',versionCode:5,file:'POS-For-Micro-Business-0.4.0.apk',size:1,sha256:'abc',publishedAt:'2026-10-23T08:00:00.000Z'}));
  const info=await app.inject({method:'GET',url:'/api/app/android'});assert.equal(info.statusCode,200);
  assert.deepEqual(info.json(),{versionName:'0.4.0',versionCode:5,size:apk.length,sha256:'abc',publishedAt:'2026-10-23T08:00:00.000Z',url:'/download/android/POS-For-Micro-Business-0.4.0.apk'});
  const latest=await app.inject({method:'GET',url:'/download/android'});assert.equal(latest.statusCode,302);assert.equal(latest.headers.location,'/download/android/POS-For-Micro-Business-0.4.0.apk');
  const file=await app.inject({method:'GET',url:'/download/android/POS-For-Micro-Business-0.4.0.apk'});assert.equal(file.statusCode,200);
  assert.equal(file.headers['content-type'],'application/vnd.android.package-archive');assert.match(file.headers['content-disposition'],/attachment; filename="POS-For-Micro-Business-0.4.0.apk"/);assert.equal(file.rawPayload.toString(),apk.toString());
  assert.equal((await app.inject({method:'GET',url:'/download/android/POS-For-Micro-Business-0.3.1.apk'})).statusCode,404);
  assert.equal((await app.inject({method:'GET',url:'/download/android/secret.txt'})).statusCode,404);
  assert.equal((await app.inject({method:'GET',url:'/download/android/..%2Fandroid.json'})).statusCode,404);
  await writeFile(join(dir,'android.json'),JSON.stringify({versionName:'x',versionCode:6,file:'../secret.txt'}));
  assert.equal((await app.inject({method:'GET',url:'/api/app/android'})).statusCode,404);
 }finally{await app.close();await db.close();await rm(dir,{recursive:true,force:true});}
});
