import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const win=process.platform==='win32';
const env={...process.env,VITE_ALLOW_HTTP:'true'};
if(existsSync('.tools/jdk'))env.JAVA_HOME=resolve('.tools/jdk');
if(existsSync('.tools/android-sdk'))env.ANDROID_HOME=resolve('.tools/android-sdk');
function run(command,args){const result=spawnSync(command,args,{stdio:'inherit',env,shell:win&&(command.endsWith('.cmd')||command.endsWith('.bat'))});if(result.error)console.error(result.error.message);if(result.status!==0)process.exit(result.status||1);}
run(win?'npm.cmd':'npm',['run','build']);
run(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android']);
run(win?'android\\gradlew.bat':'android/gradlew',['-p','android',':app:assembleDebug','--max-workers=2','--no-daemon']);
mkdirSync('artifacts',{recursive:true});copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk','artifacts/Adfirm-Micro-POS-debug.apk');
console.log('APK: '+resolve('artifacts/Adfirm-Micro-POS-debug.apk'));
