#!/usr/bin/env sh
set -eu

REMOTE="${MFM_REMOTE:-root@192.168.10.135}"
PORT="${MFM_SSH_PORT:-22}"
REMOTE_DIR="${MFM_WIKMIKS_DIR:-/opt/mfm-wikmiks}"

echo "Promoting current checked-out code to Wikmiks stable environment"
echo "remote: $REMOTE"
echo "port:   $PORT"
echo "dir:    $REMOTE_DIR"
echo
echo "This command is for approved versions only."

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: stable promotion requires a clean working tree." >&2
  git status --short
  exit 1
fi

rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='_handoff/' \
  --exclude='.playwright-cli/' \
  -e "ssh -p $PORT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
  ./ "$REMOTE:$REMOTE_DIR/"

ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" \
  "cd '$REMOTE_DIR' && npm install && npm run build && pm2 restart mfm-wikmiks --update-env && curl -I --max-time 10 http://127.0.0.1:3002/"

echo "Wikmiks stable promotion done. Public check:"
echo "  curl -I https://mfm.wikmiks.ru/"
