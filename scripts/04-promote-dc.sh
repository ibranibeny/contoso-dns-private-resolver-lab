#!/usr/bin/env bash
# Step 4: promote vm-onprem-dc01 to the first DC of contoso.org (AD DS + DNS), then add the lab records.
source ./00-variables.sh
az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
  --scripts @ps/dc-promote.ps1 --parameters "DomainName=$DOMAIN" "NetbiosName=$NETBIOS" "SafeModePassword=$ADMIN_PASS" \
  --query "value[0].message" -o tsv
echo "Waiting 8 minutes for the promotion reboot ..."; sleep 480
az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
  --scripts @ps/dc-configure.ps1 --parameters "SecondZone=$DOMAIN2" \
  --query "value[0].message" -o tsv
