# Runs on vm-onprem-dc01 via Run Command: prepare the NTDS data disk, install AD DS + DNS, create the forest.
param([string]$DomainName, [string]$NetbiosName, [string]$SafeModePassword)
$ErrorActionPreference = 'Stop'
# Data disk (LUN 0, host caching None) for the AD DS database, logs and SYSVOL
$raw = Get-Disk | Where-Object PartitionStyle -eq 'RAW' | Select-Object -First 1
if ($raw) {
  $raw | Initialize-Disk -PartitionStyle GPT -PassThru | New-Partition -DriveLetter F -UseMaximumSize |
    Format-Volume -FileSystem NTFS -NewFileSystemLabel 'NTDS' -Confirm:$false | Out-Null
}
"Data disk: $((Get-Volume -DriveLetter F).FileSystemLabel) F:\ $([math]::Round((Get-Volume -DriveLetter F).Size/1GB)) GB"
$f = Install-WindowsFeature AD-Domain-Services, DNS -IncludeManagementTools
"Install-WindowsFeature: Success=$($f.Success) RestartNeeded=$($f.RestartNeeded)"
$dsrm = ConvertTo-SecureString $SafeModePassword -AsPlainText -Force   # lab only; use Key Vault in production
$r = Install-ADDSForest -DomainName $DomainName -DomainNetbiosName $NetbiosName -InstallDns `
       -DatabasePath 'F:\NTDS' -LogPath 'F:\NTDS' -SysvolPath 'F:\SYSVOL' `
       -SafeModeAdministratorPassword $dsrm -NoRebootOnCompletion -Force -WarningAction SilentlyContinue
"Install-ADDSForest: Status=$($r.Status) RebootRequired=$($r.RebootRequired)"
"Message: $($r.Message)"
# Reboot outside Run Command so the command can return its output first
shutdown.exe /r /t 60 /c "AD DS promotion completed" | Out-Null
"Rebooting in 60 seconds to finish the promotion."
