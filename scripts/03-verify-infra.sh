#!/usr/bin/env bash
# Step 3: read back what Bicep built: networks, VPN, peering, resolver, private DNS, VMs (lab resource groups only).
source ./00-variables.sh
echo "== VNets and DNS servers =="
for rg in "$RG_ONP" "$RG_AZ"; do
  az network vnet list -g "$rg" --query "[].{VNet:name, Region:location, Prefix:join(',',addressSpace.addressPrefixes), DNS:join(',',dhcpOptions.dnsServers || ['Azure-provided'])}" -o tsv
done | awk -F'\t' 'BEGIN{printf "%-16s %-18s %-14s %s\n","VNet","Region","Prefix","DNS servers"} {printf "%-16s %-18s %-14s %s\n",$1,$2,$3,$4}'
echo "== Delegated resolver subnets =="
az network vnet subnet list -g "$RG_AZ" --vnet-name vnet-hub-sea --query "[].{Subnet:name, Prefix:addressPrefix, Delegation:join(',',delegations[].serviceName)}" -o table
echo "== Site-to-site connections =="
for c in "$RG_AZ cn-hub-to-onprem" "$RG_ONP cn-onprem-to-hub"; do
  set -- $c
  az network vpn-connection show -g "$1" -n "$2" --query "[[name, connectionStatus, connectionType, connectionProtocol]]" -o tsv
done | awk -F'\t' 'BEGIN{printf "%-18s %-10s %-6s %s\n","Connection","Status","Type","Protocol"} {printf "%-18s %-10s %-6s %s\n",$1,$2,$3,$4}'
echo "== Peering =="
az network vnet peering list -g "$RG_AZ" --vnet-name vnet-hub-sea   --query "[].{Peering:name, State:peeringState, GatewayTransit:allowGatewayTransit}" -o table
az network vnet peering list -g "$RG_AZ" --vnet-name vnet-spoke-sea --query "[].{Peering:name, State:peeringState, UseRemoteGateways:useRemoteGateways}" -o table
echo "== DNS Private Resolver =="
az dns-resolver inbound-endpoint list -g "$RG_AZ" --dns-resolver-name dnspr-hub-sea --query "[].{Inbound:name, IP:ipConfigurations[0].privateIpAddress, Allocation:ipConfigurations[0].privateIpAllocationMethod}" -o table
az dns-resolver forwarding-rule list -g "$RG_AZ" --ruleset-name dnsfrs-hub-sea --query "[].{Rule:name, Domain:domainName, Target:join(',',targetDnsServers[].ipAddress), State:forwardingRuleState}" -o table
az dns-resolver vnet-link list -g "$RG_AZ" --ruleset-name dnsfrs-hub-sea --query "[].[name, virtualNetwork.id]" -o tsv \
  | awk -F'\t' 'BEGIN{printf "%-12s %s\n","RulesetLink","VNet"} {n=split($2,p,"/"); printf "%-12s %s\n",$1,p[n]}'
echo "== Private DNS zone =="
az network private-dns record-set a list -g "$RG_AZ" -z privatelink.blob.core.windows.net --query "[].{Record:name, IP:join(',',aRecords[].ipv4Address)}" -o table
az network private-dns link vnet list -g "$RG_AZ" -z privatelink.blob.core.windows.net --query "[].{Link:name, AutoRegistration:registrationEnabled, ResolutionPolicy:resolutionPolicy, State:virtualNetworkLinkState}" -o table
echo "== VMs =="
for rg in "$RG_ONP" "$RG_AZ"; do
  az vm list -d -g "$rg" --query "[].[name, location, privateIps, publicIps || 'none', powerState]" -o tsv
done | awk -F'\t' 'BEGIN{printf "%-16s %-18s %-11s %-9s %s\n","VM","Region","PrivateIP","PublicIP","State"} {printf "%-16s %-18s %-11s %-9s %s\n",$1,$2,$3,$4,$5}'
