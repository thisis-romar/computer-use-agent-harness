#Requires -RunAsAdministrator
# setup-ssh-server.ps1
# Run from an Administrator PowerShell to enable OpenSSH Server on this Windows PC.
# After running, connect from iPhone with: ssh Romar@192.168.42.77

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "`n=== Installing OpenSSH Server ===" -ForegroundColor Cyan

$cap = Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
if ($cap.State -ne 'Installed') {
    Write-Host "Adding OpenSSH.Server capability (requires internet)..."
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
} else {
    Write-Host "OpenSSH.Server already installed."
}

Write-Host "`n=== Configuring sshd service ===" -ForegroundColor Cyan
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
Write-Host "sshd started and set to Automatic."

Write-Host "`n=== Configuring Windows Firewall ===" -ForegroundColor Cyan
$rule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule `
        -Name        "OpenSSH-Server-In-TCP" `
        -DisplayName "OpenSSH Server (sshd)" `
        -Enabled     True `
        -Direction   Inbound `
        -Protocol    TCP `
        -Action      Allow `
        -LocalPort   22 `
        -Profile     "Private,Domain"
    Write-Host "Firewall rule created."
} else {
    Set-NetFirewallRule `
        -Name    "OpenSSH-Server-In-TCP" `
        -Enabled True `
        -Profile "Private,Domain" `
        -Action  Allow
    Write-Host "Firewall rule updated."
}

Write-Host "`n=== Validation ===" -ForegroundColor Cyan

$svc = Get-Service sshd
Write-Host ("sshd Status: {0}" -f $svc.Status)
if ($svc.Status -ne 'Running') {
    Write-Warning "sshd is NOT running – check Windows Event Viewer for errors."
}

$listening = netstat -ano | Select-String ":22 "
if ($listening) {
    Write-Host "Port 22 is LISTENING."
    $listening
} else {
    Write-Warning "Port 22 is NOT listening."
}

Write-Host "`n=== Network interfaces ===" -ForegroundColor Cyan
ipconfig | Select-String -Pattern "(IPv4|Adapter)"

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Connect from iPhone:  ssh Romar@192.168.42.77"
Write-Host "Use your Windows account password (not Windows Hello PIN)."
Write-Host "If password auth fails, see docs/SSH-IPHONE-CONTROL.md for key auth."
