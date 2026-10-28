#!/usr/bin/env bash
# Step 3: read back what Bicep built: networks, VPN, peering, resolver, private DNS, VMs.
source ./00-variables.sh
echo "== VNets and DNS servers =="
az network vnet list --query "[?starts_with(name,'vnet-')].{VNet:name, Region:location, Prefix:join(',',addressSpace.addressPrefixes), DNS:join(',',dhcpOptions.dnsServers || ['Azure-provided'])}" -o table
echo "== Delegated resolver subnets =="
az network vnet subnet list -g "$RG_AZ" --vnet-name vnet-hub-sea --query "[].{Subnet:name, Prefix:addressPrefix, Delegation:join(',',delegations[].serviceName)}" -o table
echo "== Site-to-site connections =="
for rg in "$RG_AZ" "$RG_ONP"; do
  az network vpn-connection list -g "$rg" --query "[].{Connection:name, Status:connectionStatus, Type:connectionType, Protocol:connectionProtocol}" -o table
done
echo "== Peering =="
az network vnet peering list -g "$RG_AZ" --vnet-name vnet-hub-sea   --query "[].{Peering:name, State:peeringState, GatewayTransit:allowGatewayTransit}" -o table
az network vnet peering list -g "$RG_AZ" --vnet-name vnet-spoke-sea --query "[].{Peering:name, State:peeringState, UseRemoteGateways:useRemoteGateways}" -o table
echo "== DNS Private Resolver =="
az dns-resolver inbound-endpoint list -g "$RG_AZ" --dns-resolver-name dnspr-hub-sea --query "[].{Inbound:name, IP:ipConfigurations[0].privateIpAddress, Allocation:ipConfigurations[0].privateIpAllocationMethod}" -o table
az dns-resolver forwarding-rule list -g "$RG_AZ" --ruleset-name dnsfrs-hub-sea --query "[].{Rule:name, Domain:domainName, Target:join(',',targetDnsServers[].ipAddress), State:forwardingRuleState}" -o table
az dns-resolver vnet-link list -g "$RG_AZ" --ruleset-name dnsfrs-hub-sea --query "[].{RulesetLink:name, VNet:virtualNetwork.id}" -o table
echo "== Private DNS zone =="
az network private-dns record-set a list -g "$RG_AZ" -z privatelink.blob.core.windows.net --query "[].{Record:name, IP:join(',',aRecords[].ipv4Address)}" -o table
az network private-dns link vnet list -g "$RG_AZ" -z privatelink.blob.core.windows.net --query "[].{Link:name, AutoRegistration:registrationEnabled, ResolutionPolicy:resolutionPolicy, State:virtualNetworkLinkState}" -o table
echo "== VMs =="
az vm list -d --query "[?starts_with(name,'vm-')].{VM:name, Region:location, PrivateIP:privateIps, PublicIP:publicIps, State:powerState}" -o table
