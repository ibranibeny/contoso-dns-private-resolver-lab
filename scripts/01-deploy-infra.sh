#!/usr/bin/env bash
# Step 1: build, preview (what-if) and deploy the whole lab with Bicep.
# The VPN gateways are the long pole (Microsoft: 45 minutes or more); the lab run on 28 Oct 2026 finished in about 27 minutes.
source ./00-variables.sh
cd ../infra

az bicep build --file main.bicep --stdout > /dev/null && echo "Bicep build: OK"

echo "--- what-if (resource changes only) ---"
az deployment sub what-if -n "$DEPLOYMENT" -l "$LOC_AZ" -p main.bicepparam --result-format ResourceIdOnly

echo "--- deploy (runs in Azure; safe to close Cloud Shell) ---"
az deployment sub create -n "$DEPLOYMENT" -l "$LOC_AZ" -p main.bicepparam --no-wait
echo "Started. Follow it in the portal: Subscriptions > your subscription > Deployments > $DEPLOYMENT,"
echo "or run ./02-wait-infra.sh"
