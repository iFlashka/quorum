# Снимает primary monitor в PNG. Использую для self-review UI без участия пользователя.
# Использование:  pwsh -File .claude/dev-screenshot.ps1 [-OutFile path]

param(
    [string]$OutFile = (Join-Path $env:TEMP 'quorum-shot.png')
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()

Write-Output $OutFile
