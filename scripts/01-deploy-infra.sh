#!/usr/bin/env bash
# Step 1: build, preview (what-if) and deploy the whole lab with Bicep.
# The deployment takes about 50-60 minutes (the two VPN gateways take ~45 minutes in parallel).
source ./00-variables.sh
cd ../infra

az bicep build --file main.bicep --stdout > /dev/null && echo "Bicep build: OK"

echo "--- what-if (resource changes only) ---"
az deployment sub what-if -n "$DEPLOYMENT" -l "$LOC_AZ" -p main.bicepparam --result-format ResourceIdOnly

echo "--- deploy (runs in Azure; safe to close Cloud Shell) ---"
az deployment sub create -n "$DEPLOYMENT" -l "$LOC_AZ" -p main.bicepparam --no-wait
echo "Started. Follow it in the portal: Subscriptions > your subscription > Deployments > $DEPLOYMENT,"
echo "or run ./02-wait-infra.sh"
