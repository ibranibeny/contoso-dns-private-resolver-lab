#!/usr/bin/env bash
# Cleanup: delete both resource groups (the VPN gateways and resolver endpoints bill by the hour).
source ./00-variables.sh
az group delete -n "$RG_AZ"  --yes --no-wait
az group delete -n "$RG_ONP" --yes --no-wait
az deployment sub delete -n "$DEPLOYMENT" --no-wait 2>/dev/null
echo "Deletion started (about 15-20 minutes). Remove $HOME/.dnslab afterwards."
