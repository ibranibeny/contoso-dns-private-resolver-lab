#!/usr/bin/env bash
# Step 6: tests from the spoke VM (VNet DNS = inbound endpoint): AD names, DC locator, Private Endpoint, ports.
source ./00-variables.sh
az vm run-command invoke -g "$RG_AZ" -n "$VM_APP" --command-id RunPowerShellScript \
  --scripts @ps/spoke-test.ps1 --parameters "Domain=$DOMAIN" "Domain2=$DOMAIN2" "DcIp=$DC_IP" "Fqdn=$ST_NAME.blob.core.windows.net" \
  --query "value[0].message" -o tsv
