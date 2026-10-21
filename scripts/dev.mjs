import { spawn } from 'node:child_process';
const processes = [spawn(process.execPath, ['--watch', 'server/index.mjs'], {stdio:'inherit'}),spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'})];
function stop(){for(const p of processes)p.kill();process.exit();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
processes.forEach(p=>p.on('exit',code=>{if(code)stop();}));
