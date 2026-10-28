#!/usr/bin/env bash
# Runs every step in order (about 75-90 minutes). Stops at the first error.
set -euo pipefail
cd "$(dirname "$0")"
bash ./00-preflight.sh
bash ./01-deploy-infra.sh
bash ./02-wait-infra.sh
for s in 03-verify-infra 04-promote-dc 05-onprem-forwarder 06-test-spoke 07-domain-join; do
  echo; echo "==================== $s ===================="
  bash "./$s.sh"
done
