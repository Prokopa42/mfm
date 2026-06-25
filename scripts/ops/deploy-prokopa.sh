#!/usr/bin/env sh
set -eu

REMOTE="${MFM_REMOTE:-root@192.168.10.135}"
PORT="${MFM_SSH_PORT:-22}"
REMOTE_DIR="${MFM_PROKOPA_DIR:-/opt/mfm-prokopa}"
APP_PORT="${MFM_PROKOPA_PORT:-3003}"

echo "Deploying ProKopa test environment"
echo "remote: $REMOTE"
echo "port:   $PORT"
echo "dir:    $REMOTE_DIR"
echo "app:    127.0.0.1:$APP_PORT"

ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" \
  "set -eu; mkdir -p '$REMOTE_DIR'; if [ \"\$(find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)\" ]; then cp -al '$REMOTE_DIR' '${REMOTE_DIR}_before_deploy_'\$(date +%Y%m%d_%H%M%S); fi"

rsync -az --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.DS_Store' \
  --exclude='_handoff/' \
  --exclude='.playwright-cli/' \
  -e "ssh -p $PORT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new" \
  ./ "$REMOTE:$REMOTE_DIR/"

ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" \
  "set -eu; cd '$REMOTE_DIR' && npm install && npm run build && if pm2 describe mfm-prokopa >/dev/null 2>&1; then pm2 restart mfm-prokopa --update-env; else pm2 start node_modules/next/dist/bin/next --name mfm-prokopa -- start -H 127.0.0.1 -p '$APP_PORT'; fi && pm2 save && curl -I --max-time 10 http://127.0.0.1:$APP_PORT/"

echo "ProKopa deploy done. Public check:"
echo "  curl -I https://mfm.prokopa.ru/"
