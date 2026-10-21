param([Parameter(Mandatory=$true)][string]$Database,[Parameter(Mandatory=$true)][string]$Email)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if(-not (Test-Path -LiteralPath $Database)){throw 'Database not found.'}
$saved=[Environment]::GetEnvironmentVariable('ADFIRM_RESET_PASSWORD','Process')
try{
 $secret=Read-Host 'New password (16–128 characters)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try{$env:ADFIRM_RESET_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 & node scripts/reset-local-password.mjs $Database $Email
 if($LASTEXITCODE -ne 0){throw 'Password recovery failed.'}
}finally{[Environment]::SetEnvironmentVariable('ADFIRM_RESET_PASSWORD',$saved,'Process')}
