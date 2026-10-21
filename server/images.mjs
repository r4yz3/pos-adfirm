import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './domain.mjs';

sharp.cache({memory:32,files:0,items:64});
let activeJobs=0;
export async function optimizeImage(input){
  if(activeJobs>=2)throw new HttpError(429,'Image processing is busy. Try again shortly');
  activeJobs++;
  try{return await convertImage(input);}finally{activeJobs--;}
}
async function convertImage(input){
  if(!input.length||input.length>10*1024*1024)throw new HttpError(413,'Choose an image smaller than 10 MB');
  try{
    const meta=await sharp(input,{limitInputPixels:24000000,failOn:'error'}).metadata();
    if(!['jpeg','png','webp','heif'].includes(meta.format)||(meta.pages||1)>1)throw new HttpError(400,'Use a still JPEG, PNG or WebP image');
    let result;
    for(const [edge,quality]of [[1200,80],[1200,68],[1000,65],[800,60],[640,55]]){
      result=await sharp(input,{limitInputPixels:24000000,failOn:'error'}).rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality,effort:4}).toBuffer({resolveWithObject:true});
      if(result.data.length<=200*1024)break;
    }
    if(result.data.length>200*1024)throw new HttpError(400,'Image is too complex. Choose a simpler product photo');
    return {buffer:result.data,bytes:result.data.length,width:result.info.width,height:result.info.height,contentType:'image/webp'};
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Image could not be decoded. Use JPEG, PNG or WebP');}
}

export function imageStorage(env=process.env){
  const fields=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const configured=fields.filter(k=>env[k]);
  if(configured.length&&configured.length!==fields.length)throw new Error('Complete all R2 storage credentials');
  const root=resolve(env.LOCAL_IMAGE_PATH||'./data/images');
  const secret=env.IMAGE_SIGNING_SECRET||randomBytes(32).toString('hex');
  const client=configured.length?new S3Client({region:'auto',endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}}):null;
  function path(key){const value=resolve(root,key);if(!value.startsWith(root+sep))throw new Error('Invalid storage key');return value;}
  function sign(imageId,expires){return createHmac('sha256',secret).update(`${imageId}:${expires}`).digest('hex');}
  return {
    kind:client?'r2':'local',
    async put(key,buffer){if(client)await client.send(new PutObjectCommand({Bucket:env.R2_BUCKET,Key:key,Body:buffer,ContentType:'image/webp',CacheControl:'private,max-age=3600'}));else{await mkdir(dirname(path(key)),{recursive:true});await writeFile(path(key),buffer,{flag:'wx'});}},
    async remove(key){if(client)await client.send(new DeleteObjectCommand({Bucket:env.R2_BUCKET,Key:key}));else await unlink(path(key)).catch(()=>{});},
    async url(image){if(client)return getSignedUrl(client,new GetObjectCommand({Bucket:env.R2_BUCKET,Key:image.object_key}),{expiresIn:600});const expires=Date.now()+600000;return `/api/images/${image.id}/file?expires=${expires}&signature=${sign(image.id,expires)}`;},
    verify(imageId,expires,signature){if(!/^\d+$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+601000||!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(sign(imageId,expires),'hex'),Buffer.from(signature,'hex'));},
    async read(key){return readFile(path(key));},
  };
}
