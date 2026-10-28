// "On-prem" site simulated in Indonesia Central: VNet, VPN gateway + S2S connection, and dc01 (AD DS + DNS host).
param location string
param tags object = {}
param addressSpace string
param serversSubnetPrefix string
param gatewaySubnetPrefix string
param dcPrivateIp string
param vmSize string
param adminUsername string

@secure()
param adminPassword string

param gatewayPublicIpId string

@description('Public IP of the Azure (hub) VPN gateway.')
param remoteGatewayIp string

@description('Azure address spaces reachable through the tunnel (hub + spoke).')
param remoteAddressPrefixes array

@secure()
param vpnSharedKey string

// region network
// VNet DNS stays Azure-provided: this VNet hosts a VPN gateway, and the VPN Gateway FAQ recommends Azure DNS there.
resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-onprem-idc'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        addressSpace
      ]
    }
    subnets: [
      {
        name: 'snet-servers'
        properties: {
          addressPrefix: serversSubnetPrefix
          // Lab shortcut: Run Command needs outbound HTTPS to return script output.
          // In production use explicit egress (NAT Gateway / Azure Firewall).
          defaultOutboundAccess: true
        }
      }
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
        }
      }
    ]
  }
}
// endregion

// region vpn
resource gw 'Microsoft.Network/virtualNetworkGateways@2024-05-01' = {
  name: 'vpngw-onprem-idc'
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
            id: '${vnet.id}/subnets/GatewaySubnet'
          }
          publicIPAddress: {
            id: gatewayPublicIpId
          }
        }
      }
    ]
  }
}

// Describes the Azure side (hub + spoke) as seen from "on-prem".
resource lng 'Microsoft.Network/localNetworkGateways@2024-05-01' = {
  name: 'lng-azure-sea'
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
  name: 'cn-onprem-to-hub'
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

// region dc
resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'nic-vm-onprem-dc01'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Static' // Microsoft guidance: static private IP for DCs
          privateIPAddress: dcPrivateIp
          subnet: {
            id: '${vnet.id}/subnets/snet-servers'
          }
        }
      }
    ]
    dnsSettings: {
      // NIC-level DNS overrides the VNet setting. dc01 uses itself first. 168.63.129.16 is second so the VM can
      // still resolve Azure endpoints before the DNS role exists (lab bootstrap; production DCs point only to DCs).
      dnsServers: [
        dcPrivateIp
        '168.63.129.16'
      ]
    }
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-07-01' = {
  name: 'vm-onprem-dc01'
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: 'dc01'
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
        name: 'osdisk-vm-onprem-dc01'
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
      }
      dataDisks: [
        {
          // AD DS database, logs and SYSVOL go on a data disk with host caching None (Microsoft guidance for DCs on Azure).
          name: 'datadisk-vm-onprem-dc01-ntds'
          lun: 0
          createOption: 'Empty'
          diskSizeGB: 32
          caching: 'None'
          managedDisk: {
            storageAccountType: 'StandardSSD_LRS'
          }
        }
      ]
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
}
// endregion

output vnetId string = vnet.id
output gatewayId string = gw.id
output dcVmName string = vm.name
