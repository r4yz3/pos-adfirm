$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTools = Join-Path $taskRoot '.tools'
New-Item -ItemType Directory -Path $taskTools -Force | Out-Null
$taskJdk = Join-Path $taskTools 'jdk'
if (-not (Test-Path -LiteralPath (Join-Path $taskJdk 'bin\java.exe'))) {
  $taskRelease = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
  $taskPackage = $taskRelease[0].binary.package
  $taskArchive = Join-Path $taskTools 'jdk.zip'
  Write-Output 'Downloading portable JDK 21...'
  Invoke-WebRequest -Uri $taskPackage.link -OutFile $taskArchive -UseBasicParsing
  if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskPackage.checksum.ToLowerInvariant()) { throw 'JDK checksum mismatch' }
  $taskExtract = Join-Path $taskTools 'jdk-extracted'
  Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskExtract -Force
  $taskJdkSource = Get-ChildItem -LiteralPath $taskExtract -Directory | Select-Object -First 1
  Copy-Item -LiteralPath $taskJdkSource.FullName -Destination $taskJdk -Recurse -Force
}
$env:JAVA_HOME = $taskJdk
$env:PATH = (Join-Path $taskJdk 'bin') + ';' + $env:PATH
$taskSdk = Join-Path $taskTools 'android-sdk'
$env:ANDROID_HOME = $taskSdk
$taskManager = Join-Path $taskSdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path -LiteralPath $taskManager)) {
  Write-Output 'Downloading Android SDK command-line tools...'
  $taskSdkArchive = Join-Path $taskTools 'android-tools.zip'
  Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile $taskSdkArchive -UseBasicParsing
  $taskSdkExtract = Join-Path $taskTools 'android-extracted'
  Expand-Archive -LiteralPath $taskSdkArchive -DestinationPath $taskSdkExtract -Force
  New-Item -ItemType Directory -Path (Join-Path $taskSdk 'cmdline-tools') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $taskSdkExtract 'cmdline-tools') -Destination (Join-Path $taskSdk 'cmdline-tools\latest') -Recurse -Force
}
Write-Output 'Installing Android platform and build tools...'
1..80 | ForEach-Object { 'y' } | & $taskManager --sdk_root=$taskSdk --licenses | Out-Null
& $taskManager --sdk_root=$taskSdk 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed' }
$taskSdkPath = $taskSdk.Replace('\','/')
Set-Content -LiteralPath (Join-Path $taskRoot 'android\local.properties') -Value "sdk.dir=$taskSdkPath" -Encoding ascii
Write-Output 'Android toolchain ready.'
