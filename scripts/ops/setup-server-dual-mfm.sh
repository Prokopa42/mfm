#!/usr/bin/env sh
set -eu

SOURCE="/opt/mfm"
PROKOPA="/opt/mfm-prokopa"
WIKMIKS="/opt/mfm-wikmiks"
PROKOPA_PORT="3003"
WIKMIKS_PORT="3002"
BACKUP_ROOT="/opt"
STAMP="$(date +%Y%m%d_%H%M%S)"

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: run on the server as root." >&2
  exit 1
fi

if [ ! -d "$SOURCE" ]; then
  echo "ERROR: source production directory not found: $SOURCE" >&2
  exit 1
fi

echo "MFM server split"
echo "source:  $SOURCE"
echo "prokopa: $PROKOPA -> 127.0.0.1:$PROKOPA_PORT"
echo "wikmiks: $WIKMIKS -> 127.0.0.1:$WIKMIKS_PORT"
echo

echo "Creating hardlink backup of current source..."
cp -al "$SOURCE" "$BACKUP_ROOT/mfm_before_dual_env_$STAMP"
echo "backup: $BACKUP_ROOT/mfm_before_dual_env_$STAMP"

if [ ! -d "$PROKOPA" ]; then
  cp -a "$SOURCE" "$PROKOPA"
else
  echo "SKIP: exists: $PROKOPA"
fi

if [ ! -d "$WIKMIKS" ]; then
  cp -a "$SOURCE" "$WIKMIKS"
else
  echo "SKIP: exists: $WIKMIKS"
fi

build_app() {
  app_dir="$1"
  echo
  echo "Building $app_dir"
  cd "$app_dir"
  npm install
  npm run build
}

build_app "$PROKOPA"
build_app "$WIKMIKS"

echo
echo "Preparing PM2 processes..."

if pm2 describe mfm >/dev/null 2>&1; then
  echo "Stopping old shared process: mfm"
  pm2 stop mfm
fi

if pm2 describe mfm-prokopa >/dev/null 2>&1; then
  pm2 restart mfm-prokopa --update-env
else
  cd "$PROKOPA"
  pm2 start node_modules/next/dist/bin/next --name mfm-prokopa -- start -H 127.0.0.1 -p "$PROKOPA_PORT"
fi

if pm2 describe mfm-wikmiks >/dev/null 2>&1; then
  pm2 restart mfm-wikmiks --update-env
else
  cd "$WIKMIKS"
  pm2 start node_modules/next/dist/bin/next --name mfm-wikmiks -- start -H 127.0.0.1 -p "$WIKMIKS_PORT"
fi

pm2 save
pm2 status mfm-prokopa
pm2 status mfm-wikmiks

echo
echo "Local backend checks:"
curl -I --max-time 10 "http://127.0.0.1:$PROKOPA_PORT/"
curl -I --max-time 10 "http://127.0.0.1:$WIKMIKS_PORT/"

echo
echo "IMPORTANT: update Angie manually or with a reviewed config patch:"
echo "  mfm.prokopa.ru -> http://127.0.0.1:$PROKOPA_PORT"
echo "  mfm.wikmiks.ru -> http://127.0.0.1:$WIKMIKS_PORT"
echo "Then run: angie -t && systemctl reload angie"
