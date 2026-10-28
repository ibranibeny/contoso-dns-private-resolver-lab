// Parameters for main.bicep. Secrets are read from environment variables that
// scripts/00-variables.sh exports from ~/.dnslab (generated once, never printed).
using './main.bicep'

param locationOnprem = 'indonesiacentral'
param locationAzure = 'southeastasia'
param vmSize = readEnvironmentVariable('VM_SIZE', 'Standard_D2s_v5')
param adminUsername = 'labadmin'
param adminPassword = readEnvironmentVariable('ADMIN_PASS')
param vpnSharedKey = readEnvironmentVariable('VPN_PSK')
