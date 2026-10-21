#!/usr/bin/env bash
# Native, account-scoped runtime for Ubuntu 24.04 x86_64. No sudo or Docker.
set -euo pipefail
umask 077
taskRoot="${ADFIRM_DEPLOY_HOME:-$HOME/apps/adfirm-pos}"
nodeVersion=22.23.4
pgVersion=17.11
mkdir -p "$taskRoot/runtime" "$taskRoot/downloads" "$taskRoot/build-tools" "$taskRoot/logs"
cd "$taskRoot/downloads"
nodeArchive="node-v${nodeVersion}-linux-x64.tar.xz"
if [ ! -x "$taskRoot/runtime/node/bin/node" ]; then
 curl -fsSLO "https://nodejs.org/dist/v${nodeVersion}/${nodeArchive}"
 curl -fsSL "https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt" -o node-SHASUMS256.txt
 grep " ${nodeArchive}$" node-SHASUMS256.txt | sha256sum -c -
 tar -xf "$nodeArchive" -C "$taskRoot/runtime"
 ln -s "node-v${nodeVersion}-linux-x64" "$taskRoot/runtime/node"
fi
export PATH="$taskRoot/runtime/node/bin:$taskRoot/build-tools/usr/bin:$PATH"
node --version
if [ ! -x "$taskRoot/runtime/postgresql/bin/postgres" ]; then
 # Download authenticated Ubuntu packages into the account; no system installation.
 apt-get download bison flex libfl2
 for package in ./*.deb; do dpkg-deb -x "$package" "$taskRoot/build-tools"; done
 export BISON_PKGDATADIR="$taskRoot/build-tools/usr/share/bison"
 export LD_LIBRARY_PATH="$taskRoot/build-tools/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
 pgArchive="postgresql-${pgVersion}.tar.bz2"
 curl -fsSLO "https://ftp.postgresql.org/pub/source/v${pgVersion}/${pgArchive}"
 curl -fsSLO "https://ftp.postgresql.org/pub/source/v${pgVersion}/${pgArchive}.sha256"
 sha256sum -c "${pgArchive}.sha256"
 tar -xf "$pgArchive"
 cd "postgresql-${pgVersion}"
 ./configure --prefix="$taskRoot/runtime/postgresql" --without-icu --without-readline --without-zlib --with-ssl=openssl > "$taskRoot/logs/postgres-configure.log" 2>&1
 make -j2 > "$taskRoot/logs/postgres-build.log" 2>&1
 make install > "$taskRoot/logs/postgres-install.log" 2>&1
fi
"$taskRoot/runtime/postgresql/bin/postgres" --version
npm install --prefix "$taskRoot/runtime/pm2" pm2@6.0.14 --no-fund --no-audit
echo 'Account-scoped native runtime installed. Database and app have not been started.'
