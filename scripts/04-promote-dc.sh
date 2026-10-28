#!/usr/bin/env bash
# Step 4: promote vm-onprem-dc01 to the first DC of contoso.org (AD DS + DNS), then add the lab records.
# Safe to re-run: the promotion is skipped when dc01 is already a domain controller.
source ./00-variables.sh
role=$(az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
        --scripts "(Get-CimInstance Win32_ComputerSystem).DomainRole" \
        --query "value[0].message" -o tsv | sed -n '/\[stdout\]/{n;p}' | tr -dc '0-9')
if [ "${role:-0}" -ge 4 ]; then
  echo "dc01 is already a domain controller (DomainRole=$role): promotion skipped."
else
  # An ephemeral Cloud Shell session loses ~/.dnslab, and with it the password the VMs were created with.
  # Re-apply the current password to dc01's local administrator before the promotion turns it into the
  # domain administrator. VMAccess (az vm user update) supports this only while the VM is NOT yet a DC (Microsoft Learn).
  az vm user update -g "$RG_ONP" -n "$VM_DC" -u "$ADMIN_USER" -p "$ADMIN_PASS" -o none \
    && echo "dc01: local administrator password re-applied (VMAccess)."
  az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
    --scripts @ps/dc-promote.ps1 --parameters "DomainName=$DOMAIN" "NetbiosName=$NETBIOS" "SafeModePassword=$ADMIN_PASS" \
    --query "value[0].message" -o tsv
  echo "Waiting 8 minutes for the promotion reboot ..."; sleep 480
fi
az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
  --scripts @ps/dc-configure.ps1 --parameters "SecondZone=$DOMAIN2" \
  --query "value[0].message" -o tsv
