#!/usr/bin/env bash
# Run as root on the verified Ubuntu 24.04 CloudPanel host.
# Uses Docker's official apt repository; does not change CloudPanel sites or users.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo 'Root access is required to install Docker.' >&2; exit 1; fi
. /etc/os-release
if [ "$ID" != ubuntu ] || [ "$VERSION_ID" != 24.04 ]; then echo 'This installer targets Ubuntu 24.04 only.' >&2; exit 1; fi
if command -v docker >/dev/null; then
 docker version
 docker compose version
 echo 'Docker already exists; no packages changed.'
 exit 0
fi
for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
 if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
  echo "Existing $package detected. Review installed services before replacing packages." >&2; exit 1
 fi
done
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
if [ ! -e /etc/apt/keyrings/docker.asc ]; then
 curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
 chmod a+r /etc/apt/keyrings/docker.asc
fi
if [ ! -e /etc/apt/sources.list.d/docker.sources ]; then
 cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
fi
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
echo 'Docker installed. No Docker group membership or sudo rights were granted.'
