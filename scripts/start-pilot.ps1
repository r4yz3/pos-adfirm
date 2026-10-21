param([string]$DataDirectory='data/pilot',[int]$Port=4101,[switch]$Lan)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if(-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))){throw 'Run npm.cmd run build first.'}
$pilotDirectory=[System.IO.Path]::GetFullPath((Join-Path $projectRoot $DataDirectory))
$pilotDatabase=Join-Path $pilotDirectory 'adfirm.sqlite'
$keys=@('DEMO_MODE','NODE_ENV','HOST','PORT','SQLITE_PATH','LOCAL_IMAGE_PATH','DATABASE_URL','BOOTSTRAP_ADMIN_EMAIL','BOOTSTRAP_ADMIN_PASSWORD','VISION_ENABLED','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET')
$saved=@{}
foreach($key in $keys){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 $env:DEMO_MODE='false';$env:NODE_ENV='development';$env:HOST=if($Lan){'0.0.0.0'}else{'127.0.0.1'};$env:PORT=[string]$Port
 $env:SQLITE_PATH=$pilotDatabase;$env:LOCAL_IMAGE_PATH=Join-Path $pilotDirectory 'images';$env:DATABASE_URL='';$env:VISION_ENABLED='false';$env:R2_ACCOUNT_ID='';$env:R2_ACCESS_KEY_ID='';$env:R2_SECRET_ACCESS_KEY='';$env:R2_BUCKET=''
 $needsBootstrap=-not (Test-Path -LiteralPath $pilotDatabase)
 if(-not $needsBootstrap){
  $pilotUserCount=& node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.env.SQLITE_PATH,{readOnly:true});console.log(d.prepare('SELECT COUNT(*) AS n FROM users').get().n);d.close();"
  if($LASTEXITCODE -ne 0){throw 'Could not inspect the existing pilot database. Check it or restore a verified backup.'}
  $needsBootstrap=([int]$pilotUserCount -eq 0)
 }
 if($needsBootstrap){
  $env:BOOTSTRAP_ADMIN_EMAIL=Read-Host 'Local pilot admin email'
  $securePassword=Read-Host 'Initial admin password (16+ characters)' -AsSecureString
  $passwordPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try{$env:BOOTSTRAP_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)}
  if($env:BOOTSTRAP_ADMIN_PASSWORD.Length -lt 16){throw 'Admin password must have at least 16 characters.'}
 }
 Write-Host "Local pilot: http://127.0.0.1:$Port"
 Write-Host 'Demo shortcuts and AI are disabled. Records use a separate pilot database. Ctrl+C stops the server.'
 if($Lan){Write-Host "Trusted LAN only: use this PC's LAN address with port $Port in the Android API settings (ending /api)."}
 & node server/index.mjs
}finally{foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}}
