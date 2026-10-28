#!/usr/bin/env bash
# Recovery only: use this if your Cloud Shell session (and ~/.dnslab) was lost AFTER dc01 became a domain controller.
# VMAccess does not support domain controllers (Microsoft Learn), so the domain administrator is reset with
# Run Command, which runs as SYSTEM on dc01, to the password that is now in ~/.dnslab.
source ./00-variables.sh
az vm run-command invoke -g "$RG_ONP" -n "$VM_DC" --command-id RunPowerShellScript \
  --scripts 'param([string]$User, [string]$Pass)
Set-ADAccountPassword -Identity $User -Reset -NewPassword (ConvertTo-SecureString $Pass -AsPlainText -Force)
"Domain password reset for $User on $env:COMPUTERNAME"' \
  --parameters "User=$ADMIN_USER" "Pass=$ADMIN_PASS" --query "value[0].message" -o tsv
