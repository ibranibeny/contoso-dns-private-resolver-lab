#!/usr/bin/env bash
# Step 0: pre-flight checks (CLI + Bicep versions, resource providers, VM size in both regions)
source ./00-variables.sh
echo "Azure CLI      : $(az version --query '"azure-cli"' -o tsv)   (needs 2.75.0 or later for az dns-resolver)"
az bicep upgrade -o none 2>/dev/null || az bicep install -o none
echo "Bicep          : $(az bicep version 2>/dev/null | head -1)"
for ns in Microsoft.Network Microsoft.Compute Microsoft.Storage; do
  echo "Provider       : $ns = $(az provider show -n $ns --query registrationState -o tsv)"
done
# The lab VMs are regional (no zone pinned), so only a Location-level restriction blocks them.
# A Zone-level restriction (for example NotAvailableForSubscription in zone 1) is reported but does not block.
for loc in "$LOC_ONP" "$LOC_AZ"; do
  sku=$(az vm list-skus -l "$loc" --size "$VM_SIZE" --resource-type virtualMachines \
        --query "[?name=='$VM_SIZE'] | [0].{loc:length(restrictions[?type=='Location']), zones:join(',', restrictions[?type=='Zone'].restrictionInfo.zones[])}" -o tsv)
  read -r locBlocks zoneList <<< "$sku"
  if [ -z "$sku" ]; then
    echo "VM size        : $VM_SIZE in $loc = NOT OFFERED in this region - export VM_SIZE=<other size> and re-run"
  elif [ "$locBlocks" != "0" ]; then
    echo "VM size        : $VM_SIZE in $loc = NOT AVAILABLE to this subscription - export VM_SIZE=<other size> and re-run"
  else
    echo "VM size        : $VM_SIZE in $loc = available${zoneList:+ (restricted only in zone(s) $zoneList; the lab VMs are not zonal)}"
  fi
done
az extension add --name dns-resolver --upgrade --yes -o none 2>/dev/null
echo "dns-resolver   : extension $(az extension show --name dns-resolver --query version -o tsv)"
