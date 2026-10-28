#!/usr/bin/env bash
# Step 5: on-prem AD DNS -> Azure. Test before, then Option A (privatelink zone), then Option B (public zone).
source ./00-variables.sh
FQDN="$ST_NAME.blob.core.windows.net"
run() { az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
          --scripts @ps/onprem-forwarder-test.ps1 --parameters "Mode=$1" "Fqdn=$FQDN" "InboundIp=$INBOUND_IP" \
          --query "value[0].message" -o tsv; }
echo "=== BEFORE (no forwarder) ===";                                   run Before
echo "=== OPTION A: privatelink.blob.core.windows.net -> $INBOUND_IP ==="; run OptionA
echo "=== OPTION B: blob.core.windows.net -> $INBOUND_IP ===";            run OptionB
