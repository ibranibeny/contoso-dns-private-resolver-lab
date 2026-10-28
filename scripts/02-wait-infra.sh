#!/usr/bin/env bash
# Step 2: wait for the Bicep deployment, then show its outputs. Re-run any time; it only reads state.
source ./00-variables.sh
while :; do
  s=$(az deployment sub show -n "$DEPLOYMENT" --query properties.provisioningState -o tsv)
  echo "$(date +%H:%M:%S)  $DEPLOYMENT: $s"
  case "$s" in Succeeded|Failed|Canceled) break;; esac
  sleep 60
done
az deployment operation sub list -n "$DEPLOYMENT" \
  --query "[].{Module:properties.targetResource.resourceName, State:properties.provisioningState, Duration:properties.duration}" -o table
az deployment sub show -n "$DEPLOYMENT" --query "properties.outputs.{onpremGatewayIp:onpremGatewayIp.value, azureGatewayIp:azureGatewayIp.value, inboundEndpointIp:inboundEndpointIp.value, storageAccount:storageAccountName.value}" -o table
