import {S3Client,HeadBucketCommand,GetObjectCommand,PutObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {optimizeImage} from '../server/images.mjs';
// Optional --write creates and removes only this run's isolated diagnostic object.
if(process.env.R2_CHECK_ENV)process.loadEnvFile(process.env.R2_CHECK_ENV);
const required=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
if(required.some(k=>!process.env[k]))throw new Error('Configure the four server-only R2 variables first');
const client=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const Bucket=process.env.R2_BUCKET,Key=`diagnostics/adfirm/${randomUUID()}.webp`;let uploaded=false;
try{
 await client.send(new HeadBucketCommand({Bucket}));console.log('PASS: R2 bucket access');
 if(process.argv.includes('--write')){
  const input=await sharp({create:{width:1600,height:1200,channels:3,background:'#cde3ff'}}).jpeg().toBuffer();
  const optimized=await optimizeImage(input);
  await client.send(new PutObjectCommand({Bucket,Key,Body:optimized.buffer,ContentType:'image/webp'}));uploaded=true;
  const saved=await client.send(new GetObjectCommand({Bucket,Key}));const bytes=await saved.Body.transformToByteArray();
  if(!Buffer.from(bytes).equals(optimized.buffer))throw new Error('Stored image did not match uploaded WebP');
  console.log(`PASS: optimized WebP upload/read (${optimized.bytes} bytes)`);
 }
}catch(e){console.error(`FAIL: R2 ${e.name}; HTTP ${e.$metadata?.httpStatusCode||'unavailable'}`);process.exitCode=1;}
finally{
 if(uploaded)try{await client.send(new DeleteObjectCommand({Bucket,Key}));console.log('PASS: diagnostic object removed');}catch(e){console.error(`Cleanup failed for diagnostic object ${Key}: ${e.name}`);process.exitCode=1;}
 client.destroy();
}
