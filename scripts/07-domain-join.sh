#!/usr/bin/env bash
# Step 7: join the spoke VM to contoso.org through the resolver + VPN, then verify the secure channel.
source ./00-variables.sh
az vm run-command invoke -g "$RG_AZ" -n "$VM_APP" --command-id RunPowerShellScript \
  --scripts @ps/domain-join.ps1 --parameters "Domain=$DOMAIN" "User=$ADMIN_USER" "Pass=$ADMIN_PASS" \
  --query "value[0].message" -o tsv
echo "Waiting 3 minutes for the reboot ..."; sleep 180
az vm run-command invoke -g "$RG_AZ" -n "$VM_APP" --command-id RunPowerShellScript \
  --scripts "Get-CimInstance Win32_ComputerSystem | Format-List Name,Domain,PartOfDomain; nltest /sc_query:$DOMAIN; nltest /dsgetdc:$DOMAIN" \
  --query "value[0].message" -o tsv
