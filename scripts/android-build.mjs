import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
const win=process.platform==='win32';
const env={...process.env};
if(existsSync('.tools/jdk'))env.JAVA_HOME=resolve('.tools/jdk');
if(existsSync('.tools/android-sdk'))env.ANDROID_HOME=resolve('.tools/android-sdk');
// A release build needs the signing key kept outside the repository; without it, build a debug APK for local testing.
const release=existsSync(env.ADFIRM_KEYSTORE_PROPERTIES||resolve(homedir(),'.adfirm-signing/keystore.properties'))&&!process.argv.includes('--debug');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',env,shell:win&&(command.endsWith('.cmd')||command.endsWith('.bat'))});if(result.error)console.error(result.error.message);if(result.status!==0)process.exit(result.status||1);}
run(win?'npm.cmd':'npm',['run','build']);
run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android']);
run(win?'android\\gradlew.bat':'android/gradlew',['-p','android',release?':app:assembleRelease':':app:assembleDebug','--max-workers=2','--no-daemon']);
const gradle=readFileSync('android/app/build.gradle','utf8'),versionName=gradle.match(/versionName "([^"]+)"/)[1],versionCode=Number(gradle.match(/versionCode (\d+)/)[1]);
const built=release?'android/app/build/outputs/apk/release/app-release.apk':'android/app/build/outputs/apk/debug/app-debug.apk';
const file=`POS-For-Micro-Business-${versionName}${release?'':'-debug'}.apk`,target=resolve('artifacts',file);
mkdirSync('artifacts',{recursive:true});copyFileSync(built,target);
const bytes=readFileSync(target),info={versionName,versionCode,file,size:statSync(target).size,sha256:createHash('sha256').update(bytes).digest('hex'),publishedAt:new Date().toISOString(),release};
// android.json is what the server's download page reads; publish it next to the APK.
writeFileSync(resolve('artifacts','android.json'),JSON.stringify(info,null,2)+'\n');
console.log(`APK: ${target}\n${release?'Release (signed)':'Debug'} · ${versionName} (${versionCode}) · ${(info.size/1048576).toFixed(1)} MB\nSHA-256: ${info.sha256}`);
