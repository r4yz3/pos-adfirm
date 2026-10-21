import {cp,readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [source,target]=process.argv.slice(2);if(!source||!target)throw new Error('Usage: npm run backup:restore -- <backup-folder> <new-empty-directory>');
const from=resolve(source),to=resolve(target);if(existsSync(to))throw new Error('Restore destination must not exist. Existing databases are never overwritten.');
const manifest=JSON.parse(await readFile(join(from,'manifest.json'),'utf8')),bytes=await readFile(join(from,'adfirm.sqlite'));if(createHash('sha256').update(bytes).digest('hex')!==manifest.databaseSha256)throw new Error('Backup checksum mismatch');
await mkdir(to,{recursive:true});await cp(join(from,'adfirm.sqlite'),join(to,'adfirm.sqlite'),{errorOnExist:true});if(existsSync(join(from,'images')))await cp(join(from,'images'),join(to,'images'),{recursive:true,errorOnExist:true});
console.log('Restored to '+to);console.log('Stop the API before switching SQLITE_PATH and LOCAL_IMAGE_PATH to this restored directory.');
