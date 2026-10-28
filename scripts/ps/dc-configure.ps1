# Runs on vm-onprem-dc01 after the promotion reboot: upstream forwarder, second zone, test records.
param([string]$SecondZone)
$ErrorActionPreference = 'Stop'
# Internet names go to the Azure-provided DNS of this VNet (stands in for the ISP / on-prem upstream).
# Microsoft Learn: Windows DNS servers that forward to Azure DNS should use a forwarding timeout above 4 seconds.
Set-DnsServerForwarder -IPAddress 168.63.129.16 -UseRootHint $false -Timeout 5
if (-not (Get-DnsServerZone -Name $SecondZone -ErrorAction SilentlyContinue)) {
  Add-DnsServerPrimaryZone -Name $SecondZone -ReplicationScope Forest
}
$dom = (Get-ADDomain).DNSRoot
Add-DnsServerResourceRecordA -ZoneName $SecondZone -Name portal   -IPv4Address 10.10.1.60 -ErrorAction SilentlyContinue
Add-DnsServerResourceRecordA -ZoneName $dom        -Name intranet -IPv4Address 10.10.1.50 -ErrorAction SilentlyContinue
"Domain: $dom   DC: $env:COMPUTERNAME   Forest mode: $((Get-ADForest).ForestMode)"
Get-DnsServerZone | Where-Object { -not $_.IsAutoCreated -and $_.ZoneName -notlike '*.arpa' -and $_.ZoneName -ne 'TrustAnchors' } |
  Format-Table ZoneName, ZoneType, IsDsIntegrated, ReplicationScope -AutoSize | Out-String -Width 110
$fw = Get-DnsServerForwarder
"Server forwarder: $($fw.IPAddress.IPAddressToString -join ',')  UseRootHint=$($fw.UseRootHint)  Timeout=$($fw.Timeout)s"
