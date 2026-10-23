// Renders the app icons in public/ from one brand mark. Run with: node scripts/generate-icons.mjs
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';

const mark=({size,radius,scale})=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f78dc"/><stop offset="1" stop-color="#1a4f9e"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
<text x="50%" y="${size*(.5+.29*scale)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size*.84*scale}" fill="#fff">a</text>
</svg>`;

// Rounded mark for the browser tab; iPhone and maskable icons are full-bleed because the OS applies its own shape.
await writeFile('public/icon.svg',mark({size:64,radius:18,scale:1})+'\n');
const outputs=[['public/apple-touch-icon.png',180,0,1],['public/icon-192.png',192,42,1],['public/icon-512.png',512,112,1],['public/icon-maskable-512.png',512,0,.78]];
for(const [file,size,radius,scale] of outputs)await sharp(Buffer.from(mark({size,radius,scale}))).png().toFile(file);
console.log(`Wrote public/icon.svg and ${outputs.length} PNG icons`);
