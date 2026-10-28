# Runs on vm-spoke-app01 (VNet DNS = DNS Private Resolver inbound endpoint).
param([string]$Domain, [string]$Domain2, [string]$DcIp, [string]$Fqdn)
Clear-DnsClientCache
$dns = (Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | Select-Object -First 1).ServerAddresses -join ','
"DNS server used by this VM: $dns"
""
function Q([string]$name, [string]$type = 'A') {
  $r = Resolve-DnsName $name -Type $type -DnsOnly -ErrorAction SilentlyContinue
  if (-not $r) { return ('{0,-44} {1,-4} FAILED' -f $name, $type) }
  if ($type -eq 'SRV') { $v = ($r | Where-Object Type -eq 'SRV' | ForEach-Object { "$($_.NameTarget):$($_.Port)" }) -join ', ' }
  else {
    $v  = ($r | Where-Object Type -eq 'A' | Select-Object -ExpandProperty IPAddress) -join ', '
    $cn = $r | Where-Object Type -eq 'CNAME' | Select-Object -First 1 -ExpandProperty NameHost
    if ($cn) { $v = "$v  (via $cn)" }
  }
  '{0,-44} {1,-4} {2}' -f $name, $type, $v
}
Q "dc01.$Domain"
Q "intranet.$Domain"
Q "_ldap._tcp.dc._msdcs.$Domain" 'SRV'
Q "portal.$Domain2"
Q $Fqdn
Q 'www.microsoft.com'
""
"DC locator (nltest /dsgetdc:$Domain /force):"
(nltest /dsgetdc:$Domain /force 2>&1 | Select-String 'DC:|Address:|Dom Name:|Dc Site Name:|completed successfully|ERROR') -join "`n"
""
foreach ($p in 53, 88, 389, 445) {
  $t = Test-NetConnection $DcIp -Port $p -WarningAction SilentlyContinue
  'TCP {0,-4} to {1} : {2}' -f $p, $DcIp, $t.TcpTestSucceeded
}
