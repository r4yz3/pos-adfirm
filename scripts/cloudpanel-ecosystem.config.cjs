const path=require('node:path');
const os=require('node:os');
const root=process.env.ADFIRM_DEPLOY_HOME||path.join(os.homedir(),'apps/adfirm-pos');
module.exports={apps:[{
 name:'adfirm-pos',cwd:path.join(root,'current'),script:'server/index.mjs',
 interpreter:path.join(root,'runtime/node/bin/node'),instances:1,exec_mode:'fork',
 autorestart:true,min_uptime:'10s',max_restarts:10,restart_delay:3000,
 max_memory_restart:'384M',node_args:'--max-old-space-size=256',
 out_file:path.join(root,'logs/api-out.log'),error_file:path.join(root,'logs/api-error.log'),
 time:true,env:{NODE_ENV:'production',DEMO_MODE:'false',HOST:'127.0.0.1',PORT:'4100',TRUST_PROXY:'loopback'}
}]};
