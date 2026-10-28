#!/usr/bin/env bash
# Step 0: pre-flight checks (CLI + Bicep versions, resource providers, VM size in both regions)
source ./00-variables.sh
echo "Azure CLI      : $(az version --query '"azure-cli"' -o tsv)   (needs 2.75.0 or later for az dns-resolver)"
az bicep upgrade -o none 2>/dev/null || az bicep install -o none
echo "Bicep          : $(az bicep version 2>/dev/null | head -1)"
for ns in Microsoft.Network Microsoft.Compute Microsoft.Storage; do
  echo "Provider       : $ns = $(az provider show -n $ns --query registrationState -o tsv)"
done
for loc in "$LOC_ONP" "$LOC_AZ"; do
  ok=$(az vm list-skus -l "$loc" --size "$VM_SIZE" --resource-type virtualMachines \
        --query "[?length(restrictions)==\`0\`].name | [0]" -o tsv)
  echo "VM size        : $VM_SIZE in $loc = ${ok:-NOT AVAILABLE - export VM_SIZE=<other size> and re-run}"
done
az extension add --name dns-resolver --upgrade --yes -o none 2>/dev/null
echo "dns-resolver   : extension $(az extension show --name dns-resolver --query version -o tsv)"
