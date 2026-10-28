# Runs on vm-spoke-app01: join contoso.org over the VPN, then restart.
param([string]$Domain, [string]$User, [string]$Pass)
$cred = New-Object System.Management.Automation.PSCredential ("$Domain\$User", (ConvertTo-SecureString $Pass -AsPlainText -Force))
try {
  Add-Computer -DomainName $Domain -Credential $cred -Force -ErrorAction Stop
  "Joined $env:COMPUTERNAME to $Domain. Restarting in 30 seconds."
  shutdown.exe /r /t 30 /c "Domain join" | Out-Null
} catch {
  "Domain join FAILED: $($_.Exception.Message)"
}
