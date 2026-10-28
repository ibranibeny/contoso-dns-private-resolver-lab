# Runs on vm-onprem-dc01: resolve a Private Endpoint name before / with Option A / with Option B forwarders.
param([string]$Mode, [string]$Fqdn, [string]$InboundIp)
$pl  = 'privatelink.blob.core.windows.net'
$pub = 'blob.core.windows.net'
function Drop($z) { if (Get-DnsServerZone -Name $z -ErrorAction SilentlyContinue) { Remove-DnsServerZone -Name $z -Force } }
function Add($z)  { if (-not (Get-DnsServerZone -Name $z -ErrorAction SilentlyContinue)) {
                      Add-DnsServerConditionalForwarderZone -Name $z -MasterServers $InboundIp -ReplicationScope Forest } }
switch ($Mode) {
  'Before'  { Drop $pl;  Drop $pub }
  'OptionA' { Drop $pub; Add $pl }
  'OptionB' { Drop $pl;  Add $pub }
}
Clear-DnsServerCache -Force; Clear-DnsClientCache
$ans = Resolve-DnsName $Fqdn -Server 127.0.0.1 -DnsOnly -ErrorAction SilentlyContinue
$a   = ($ans | Where-Object Type -eq 'A'     | Select-Object -ExpandProperty IPAddress) -join ', '
$cn  = ($ans | Where-Object Type -eq 'CNAME' | ForEach-Object { $_.NameHost }) -join '  >  '
"Mode       : $Mode"
"Query      : $Fqdn (asked to this DNS server)"
"CNAME chain: $cn"
"A record   : $a"
"Private IP?: $(if ($a -match '^10\.') {'YES - Private Endpoint'} else {'no - public address'})"
"Conditional forwarders on this server:"
Get-DnsServerZone | Where-Object ZoneType -eq 'Forwarder' |
  Format-Table ZoneName, @{n='MasterServers';e={$_.MasterServers.IPAddressToString -join ','}}, IsDsIntegrated, ReplicationScope -AutoSize |
  Out-String -Width 120
