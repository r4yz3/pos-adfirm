import sharp from 'sharp';
import {readFile,readdir,writeFile} from 'node:fs/promises';
const icon=await readFile('public/icon.svg');
const root='android/app/src/main/res';
for(const [folder,size]of Object.entries({'mipmap-mdpi':48,'mipmap-hdpi':72,'mipmap-xhdpi':96,'mipmap-xxhdpi':144,'mipmap-xxxhdpi':192})){
 for(const name of ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png'])await sharp(icon).resize(name.includes('foreground')?Math.round(size*2.25):size).png().toFile(`${root}/${folder}/${name}`);
}
for(const folder of await readdir(root,{withFileTypes:true}))if(folder.isDirectory()&&folder.name.startsWith('drawable')){
 for(const name of await readdir(`${root}/${folder.name}`))if(name==='splash.png'){
  const file=`${root}/${folder.name}/${name}`,meta=await sharp(file).metadata();
  const size=Math.min(160,Math.round(Math.min(meta.width,meta.height)*.22));
  const mark=await sharp(icon).resize(size,size).png().toBuffer();
  const splash=await sharp({create:{width:meta.width,height:meta.height,channels:4,background:'#FAFCFF'}}).composite([{input:mark,gravity:'center'}]).png().toBuffer();
  await writeFile(file,splash);
 }
}
console.log('Android brand icons updated');
