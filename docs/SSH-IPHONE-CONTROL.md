# iPhone SSH Control – grandMA2 onPC Workflow

Keep Codex desktop minimized or off-screen and control the Windows PC from your
iPhone so grandMA2 onPC screenshots are clean (no Codex window in the way).

---

## 1. One-time Windows setup

Open **PowerShell as Administrator** and run the setup script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd C:\Users\romar\Documents\computer-use-harness
.\scripts\setup-ssh-server.ps1
```

The script installs OpenSSH Server, enables the `sshd` service on startup, and
opens TCP 22 in Windows Firewall for Private/Domain networks.

### What the script validates

| Check | Expected result |
|---|---|
| `Get-Service sshd` | `Status: Running` |
| `netstat -ano \| Select-String ":22 "` | `TCP 0.0.0.0:22 LISTENING` |
| `ipconfig` | Confirm LAN IP is `192.168.42.77` |

---

## 2. Connect from iPhone

Install any of these SSH clients:

- **Termius** (free tier is fine)
- Blink Shell
- Prompt 3
- Secure ShellFish

### Connection details

| Field | Value |
|---|---|
| Host | `192.168.42.77` |
| Port | `22` |
| Username | `Romar` |
| Password | Windows account password (**not** your Windows Hello PIN) |

---

## 3. First commands after connecting

```bash
cd C:\Users\romar\Documents\computer-use-harness
git status --short --branch
curl http://127.0.0.1:3099/health
```

A `200 OK` from the health endpoint confirms the harness server is running.

---

## 4. Optional: SSH key auth (skip password prompts)

On your iPhone SSH client, generate or copy your public key, then on the Windows
PC (from any shell):

```powershell
# Create the authorized_keys file for the Romar account
$dir  = "C:\Users\Romar\.ssh"
$file = "$dir\authorized_keys"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir }

# Paste your iPhone public key below
Add-Content $file "ssh-ed25519 AAAA...your-key-here... iphone"

# Lock down permissions (OpenSSH on Windows is strict about this)
icacls $file /inheritance:r /grant "Romar:(R)" /grant "SYSTEM:(R)"
```

---

## 5. Minimizing Codex so screenshots are clean

Once SSH is working, use the iPhone terminal to:

```powershell
# Minimize all windows that match "Codex"
$shell = New-Object -ComObject Shell.Application
$shell.Windows() | Where-Object { $_.Name -like "*Codex*" } |
    ForEach-Object { $_.Document.Application.MinimizeAll() }
```

Or move the Codex window off-screen before taking a grandMA2 screenshot:

```powershell
# Move Codex window to -9999,-9999 (off-screen)
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Win32{
  [DllImport("user32.dll")]public static extern bool SetWindowPos(
    IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);
  [DllImport("user32.dll")]public static extern IntPtr FindWindow(string c,string t);
}
"@
$hwnd = [Win32]::FindWindow([NullString]::Value, "Codex")
[Win32]::SetWindowPos($hwnd, [IntPtr]::Zero, -9999, -9999, 0, 0, 0x0001 -bor 0x0004)
```

---

## 6. Priority order for grandMA2 control

1. **Native Windows automation via harness** – cleanest screenshots, full control
2. **Web Remote** – fallback only; do not use as primary path
3. iPhone MA2 Web Remote – third resort

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Connection refused` on port 22 | Re-run `setup-ssh-server.ps1` as Administrator |
| Password rejected | Use the Windows account password, not the PIN |
| `sshd` starts then stops | Check Event Viewer → Windows Logs → Application for `OpenSSH` entries |
| Port 22 not listening after install | Reboot and run `Start-Service sshd` again |
| Firewall blocks connection | Confirm network profile is Private, not Public: `Get-NetConnectionProfile` |
