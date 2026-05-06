# Снимает либо primary monitor (по умолчанию), либо конкретное окно по части заголовка.
# Использую для self-review UI без участия пользователя.
#
# Примеры:
#   pwsh -File .claude/dev-screenshot.ps1
#   pwsh -File .claude/dev-screenshot.ps1 -WindowTitle "Quorum"

param(
    [string]$OutFile = (Join-Path $env:TEMP 'quorum-shot.png'),
    [string]$WindowTitle = ''
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if ($WindowTitle) {
    # Ищем visible top-level окно процесса quorum-desktop (Tauri-приложение).
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32Api {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }
"@

    # Найдём PID процесса quorum-desktop (Tauri-приложение в dev и release).
    $procs = Get-Process -Name 'quorum-desktop' -ErrorAction SilentlyContinue
    if (-not $procs) {
        Write-Error "Process 'quorum-desktop' not running"
        exit 1
    }
    $script:targetPids = $procs | ForEach-Object { $_.Id }
    $script:found = [IntPtr]::Zero
    $cb = [Win32Api+EnumWindowsProc]{
        param($hwnd, $lparam)
        if (-not [Win32Api]::IsWindowVisible($hwnd)) { return $true }
        $procId = 0
        [void][Win32Api]::GetWindowThreadProcessId($hwnd, [ref]$procId)
        if ($script:targetPids -notcontains $procId) { return $true }
        $sb = New-Object System.Text.StringBuilder 256
        [void][Win32Api]::GetWindowText($hwnd, $sb, $sb.Capacity)
        if (-not $sb.ToString()) { return $true }  # пропускаем безымянные служебные окна
        $script:found = $hwnd
        return $false
    }
    [void][Win32Api]::EnumWindows($cb, [IntPtr]::Zero)
    $found = $script:found

    if ($found -eq [IntPtr]::Zero) {
        Write-Error "Window with title containing '$WindowTitle' not found"
        exit 1
    }

    [void][Win32Api]::ShowWindow($found, 9)  # SW_RESTORE
    [void][Win32Api]::SetForegroundWindow($found)
    Start-Sleep -Milliseconds 300

    $rect = New-Object RECT
    [void][Win32Api]::GetWindowRect($found, [ref]$rect)
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top

    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()
}
else {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()
}

Write-Output $OutFile
