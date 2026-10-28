// Azure site in Southeast Asia: hub (VPN gateway + DNS Private Resolver) and spoke (VM + blob Private Endpoint).
param location string
param tags object = {}
param hubAddressSpace string
param hubGatewaySubnetPrefix string
param inboundSubnetPrefix string
param outboundSubnetPrefix string
param spokeAddressSpace string
param workloadSubnetPrefix string
param peSubnetPrefix string
param inboundEndpointIp string
param appPrivateIp string
param vmSize string
param adminUsername string

@secure()
param adminPassword string

param gatewayPublicIpId string

@description('Public IP of the on-prem (Indonesia Central) VPN gateway.')
param remoteGatewayIp string

@description('On-prem address spaces reachable through the tunnel.')
param remoteAddressPrefixes array

@secure()
param vpnSharedKey string

@description('AD DNS namespaces forwarded by the ruleset (without trailing dot).')
param forwardedDomains array

@description('DNS server that is authoritative for forwardedDomains (the on-prem DC).')
param dnsTargetIp string

var blobZoneName = 'privatelink.blob.core.windows.net'
var storageAccountName = 'stdnslab${uniqueString(resourceGroup().id)}'

// region network
// Hub DNS stays Azure-provided: never point the resolver's own VNet at its inbound endpoint (Microsoft Learn).
resource hub 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-hub-sea'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        hubAddressSpace
      ]
    }
    subnets: [
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: hubGatewaySubnetPrefix
        }
      }
      {
        // Each resolver endpoint needs its own /28-/24 subnet, delegated to Microsoft.Network/dnsResolvers
        name: 'snet-dnspr-inbound'
        properties: {
          addressPrefix: inboundSubnetPrefix
          delegations: [
            {
              name: 'Microsoft.Network.dnsResolvers'
              properties: {
                serviceName: 'Microsoft.Network/dnsResolvers'
              }
            }
          ]
        }
      }
      {
        name: 'snet-dnspr-outbound'
        properties: {
          addressPrefix: outboundSubnetPrefix
          delegations: [
            {
              name: 'Microsoft.Network.dnsResolvers'
              properties: {
                serviceName: 'Microsoft.Network/dnsResolvers'
              }
            }
          ]
        }
      }
    ]
  }
}

// Spoke uses the inbound endpoint as its DNS server (centralized model).
resource spoke 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-spoke-sea'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        spokeAddressSpace
      ]
    }
    dhcpOptions: {
      dnsServers: [
        inboundEndpointIp
      ]
    }
    subnets: [
      {
        name: 'snet-workload'
        properties: {
          addressPrefix: workloadSubnetPrefix
          defaultOutboundAccess: true // lab shortcut for Run Command output; use explicit egress in production
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: peSubnetPrefix
        }
      }
    ]
  }
}
// endregion

// region vpn
resource gw 'Microsoft.Network/virtualNetworkGateways@2024-05-01' = {
  name: 'vpngw-hub-sea'
  location: location
  tags: tags
  properties: {
    gatewayType: 'Vpn'
    vpnType: 'RouteBased'
    vpnGatewayGeneration: 'Generation1'
    sku: {
      name: 'VpnGw1AZ'
      tier: 'VpnGw1AZ'
    }
    activeActive: false
    enableBgp: false
    ipConfigurations: [
      {
        name: 'default'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: '${hub.id}/subnets/GatewaySubnet'
          }
          publicIPAddress: {
            id: gatewayPublicIpId
          }
        }
      }
    ]
  }
}

// Describes the "on-prem" site as seen from Azure.
resource lng 'Microsoft.Network/localNetworkGateways@2024-05-01' = {
  name: 'lng-onprem-idc'
  location: location
  tags: tags
  properties: {
    gatewayIpAddress: remoteGatewayIp
    localNetworkAddressSpace: {
      addressPrefixes: remoteAddressPrefixes
    }
  }
}

resource cn 'Microsoft.Network/connections@2024-05-01' = {
  name: 'cn-hub-to-onprem'
  location: location
  tags: tags
  properties: {
    connectionType: 'IPsec'
    connectionProtocol: 'IKEv2'
    virtualNetworkGateway1: {
      id: gw.id
      properties: {}
    }
    localNetworkGateway2: {
      id: lng.id
      properties: {}
    }
    sharedKey: vpnSharedKey
    enableBgp: false
  }
}
// endregion

// region peering
// Gateway transit needs the hub gateway to exist first.
resource peerHubToSpoke 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-05-01' = {
  parent: hub
  name: 'peer-hub-to-spoke'
  properties: {
    remoteVirtualNetwork: {
      id: spoke.id
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    allowGatewayTransit: true
    useRemoteGateways: false
  }
  dependsOn: [
    gw
  ]
}

resource peerSpokeToHub 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@2024-05-01' = {
  parent: spoke
  name: 'peer-spoke-to-hub'
  properties: {
    remoteVirtualNetwork: {
      id: hub.id
    }
    allowVirtualNetworkAccess: true
    allowForwardedTraffic: true
    allowGatewayTransit: false
    useRemoteGateways: true
  }
  dependsOn: [
    gw
    peerHubToSpoke
  ]
}
// endregion

// region resolver
resource resolver 'Microsoft.Network/dnsResolvers@2022-07-01' = {
  name: 'dnspr-hub-sea'
  location: location
  tags: tags
  properties: {
    virtualNetwork: {
      id: hub.id
    }
  }
}

resource inbound 'Microsoft.Network/dnsResolvers/inboundEndpoints@2022-07-01' = {
  parent: resolver
  name: 'in-hub-sea'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        privateIpAllocationMethod: 'Static'
        privateIpAddress: inboundEndpointIp
        subnet: {
          id: '${hub.id}/subnets/snet-dnspr-inbound'
        }
      }
    ]
  }
}

resource outbound 'Microsoft.Network/dnsResolvers/outboundEndpoints@2022-07-01' = {
  parent: resolver
  name: 'out-hub-sea'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: '${hub.id}/subnets/snet-dnspr-outbound'
    }
  }
}

resource ruleset 'Microsoft.Network/dnsForwardingRulesets@2022-07-01' = {
  name: 'dnsfrs-hub-sea'
  location: location
  tags: tags
  properties: {
    dnsResolverOutboundEndpoints: [
      {
        id: outbound.id
      }
    ]
  }
}

// contoso.org. and contoso.com. -> the on-prem DC (longest-suffix match also covers _msdcs, _sites, _tcp)
resource rules 'Microsoft.Network/dnsForwardingRulesets/forwardingRules@2022-07-01' = [for d in forwardedDomains: {
  parent: ruleset
  name: replace(d, '.', '-')
  properties: {
    domainName: '${d}.'
    forwardingRuleState: 'Enabled'
    targetDnsServers: [
      {
        ipAddress: dnsTargetIp
        port: 53
      }
    ]
  }
}]

// Linked to the HUB only: spokes reach the rules through the inbound endpoint (hub context).
resource rulesetHubLink 'Microsoft.Network/dnsForwardingRulesets/virtualNetworkLinks@2022-07-01' = {
  parent: ruleset
  name: 'link-hub'
  properties: {
    virtualNetwork: {
      id: hub.id
    }
  }
}
// endregion

// region privatelink
resource blobZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: blobZoneName
  location: 'global'
  tags: tags
}

// Linked to the hub (the resolver's VNet). Fallback to internet (NxDomainRedirect): the VPN Gateway FAQ asks for it
// when privatelink.blob.core.windows.net is linked to a VNet that hosts a VPN gateway (the gateway needs Blob Storage).
resource blobZoneHubLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobZone
  name: 'link-hub'
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: {
      id: hub.id
    }
    registrationEnabled: false
    resolutionPolicy: 'NxDomainRedirect'
  }
}

resource st 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    publicNetworkAccess: 'Disabled'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource pe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: 'pe-${storageAccountName}-blob'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: '${spoke.id}/subnets/snet-pe'
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-blob'
        properties: {
          privateLinkServiceId: st.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource peZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: pe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobZone.id
        }
      }
    ]
  }
}
// endregion

// region app
resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'nic-vm-spoke-app01'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Static'
          privateIPAddress: appPrivateIp
          subnet: {
            id: '${spoke.id}/subnets/snet-workload'
          }
        }
      }
    ]
  }
}

// Created after the peering and the inbound endpoint, so its first boot already resolves through 10.20.0.4.
resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: 'vm-spoke-app01'
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: 'app01'
      adminUsername: adminUsername
      adminPassword: adminPassword
      windowsConfiguration: {
        provisionVMAgent: true
        enableAutomaticUpdates: true
        timeZone: 'SE Asia Standard Time'
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-azure-edition'
        version: 'latest'
      }
      osDisk: {
        name: 'osdisk-vm-spoke-app01'
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
    securityProfile: {
      securityType: 'TrustedLaunch'
      uefiSettings: {
        secureBootEnabled: true
        vTpmEnabled: true
      }
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
  dependsOn: [
    peerSpokeToHub
    inbound
  ]
}
// endregion

output hubVnetId string = hub.id
output spokeVnetId string = spoke.id
output inboundEndpointIp string = inbound.properties.ipConfigurations[0].privateIpAddress
output storageAccountName string = st.name
output appVmName string = vm.name
