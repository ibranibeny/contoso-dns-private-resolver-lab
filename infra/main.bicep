// =============================================================================
// Hybrid DNS lab: Azure DNS Private Resolver (Indonesia Central <-> Southeast Asia)
// main.bicep (subscription scope). Creates both resource groups and deploys the two sites.
//
//   "On-prem" (Indonesia Central) : VNet, AD DS + DNS VM (dc01), VPN gateway, local network gateway, S2S connection
//   Azure     (Southeast Asia)    : hub VNet (VPN gateway + DNS Private Resolver), spoke VNet (VM + blob Private Endpoint),
//                                   peering with gateway transit, forwarding ruleset, private DNS zone, S2S connection
//
// Deploy:  az deployment sub create -n dnslab -l southeastasia -p main.bicepparam
// =============================================================================
targetScope = 'subscription'

@description('Region that simulates the on-premises data centre.')
param locationOnprem string = 'indonesiacentral'

@description('Region of the Azure hub-spoke.')
param locationAzure string = 'southeastasia'

param rgOnpremName string = 'rg-dnslab-onprem-idc'
param rgAzureName string = 'rg-dnslab-azure-sea'

@description('Local administrator of both VMs (becomes the domain administrator after dc01 is promoted).')
param adminUsername string = 'labadmin'

@secure()
@description('Password for adminUsername.')
param adminPassword string

@secure()
@description('IPsec pre-shared key, identical on both site-to-site connections.')
param vpnSharedKey string

param vmSize string = 'Standard_D2s_v5'

@description('AD DNS namespaces that the forwarding ruleset sends to the on-prem DC.')
param forwardedDomains array = [
  'contoso.org'
  'contoso.com'
]

// ---- address plan (lab ranges, not production) -------------------------------
param onpremAddressSpace string = '10.10.0.0/16'
param onpremServersSubnet string = '10.10.1.0/24'
param onpremGatewaySubnet string = '10.10.255.0/27'
param hubAddressSpace string = '10.20.0.0/16'
param hubGatewaySubnet string = '10.20.255.0/27'
param hubInboundSubnet string = '10.20.0.0/28'
param hubOutboundSubnet string = '10.20.0.16/28'
param spokeAddressSpace string = '10.21.0.0/16'
param spokeWorkloadSubnet string = '10.21.1.0/24'
param spokePeSubnet string = '10.21.2.0/24'

param dcPrivateIp string = '10.10.1.4'
param appPrivateIp string = '10.21.1.4'
param inboundEndpointIp string = '10.20.0.4'

param tags object = {
  lab: 'dns-private-resolver'
}

resource rgOnprem 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgOnpremName
  location: locationOnprem
  tags: union(tags, {
    site: 'onprem-simulated'
  })
}

resource rgAzure 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgAzureName
  location: locationAzure
  tags: union(tags, {
    site: 'azure-hub-spoke'
  })
}

// Public IPs first: each site's local network gateway needs the OTHER site's gateway address.
module pipOnprem 'modules/gateway-public-ip.bicep' = {
  scope: rgOnprem
  name: 'pip-vpngw-onprem-idc'
  params: {
    name: 'pip-vpngw-onprem-idc'
    location: locationOnprem
    tags: tags
  }
}

module pipAzure 'modules/gateway-public-ip.bicep' = {
  scope: rgAzure
  name: 'pip-vpngw-hub-sea'
  params: {
    name: 'pip-vpngw-hub-sea'
    location: locationAzure
    tags: tags
  }
}

module onprem 'modules/onprem.bicep' = {
  scope: rgOnprem
  name: 'onprem-site'
  params: {
    location: locationOnprem
    tags: tags
    addressSpace: onpremAddressSpace
    serversSubnetPrefix: onpremServersSubnet
    gatewaySubnetPrefix: onpremGatewaySubnet
    dcPrivateIp: dcPrivateIp
    vmSize: vmSize
    adminUsername: adminUsername
    adminPassword: adminPassword
    gatewayPublicIpId: pipOnprem.outputs.id
    remoteGatewayIp: pipAzure.outputs.ipAddress
    remoteAddressPrefixes: [
      hubAddressSpace
      spokeAddressSpace
    ]
    vpnSharedKey: vpnSharedKey
  }
}

module azure 'modules/azure.bicep' = {
  scope: rgAzure
  name: 'azure-hub-spoke'
  params: {
    location: locationAzure
    tags: tags
    hubAddressSpace: hubAddressSpace
    hubGatewaySubnetPrefix: hubGatewaySubnet
    inboundSubnetPrefix: hubInboundSubnet
    outboundSubnetPrefix: hubOutboundSubnet
    spokeAddressSpace: spokeAddressSpace
    workloadSubnetPrefix: spokeWorkloadSubnet
    peSubnetPrefix: spokePeSubnet
    inboundEndpointIp: inboundEndpointIp
    appPrivateIp: appPrivateIp
    vmSize: vmSize
    adminUsername: adminUsername
    adminPassword: adminPassword
    gatewayPublicIpId: pipAzure.outputs.id
    remoteGatewayIp: pipOnprem.outputs.ipAddress
    remoteAddressPrefixes: [
      onpremAddressSpace
    ]
    vpnSharedKey: vpnSharedKey
    forwardedDomains: forwardedDomains
    dnsTargetIp: dcPrivateIp
  }
}

output onpremGatewayIp string = pipOnprem.outputs.ipAddress
output azureGatewayIp string = pipAzure.outputs.ipAddress
output inboundEndpointIp string = azure.outputs.inboundEndpointIp
output storageAccountName string = azure.outputs.storageAccountName
output dcVmName string = onprem.outputs.dcVmName
output appVmName string = azure.outputs.appVmName
