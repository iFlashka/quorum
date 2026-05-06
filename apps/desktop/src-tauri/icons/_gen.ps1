Add-Type -AssemblyName System.Drawing
$out = $PSScriptRoot

function New-QIcon {
    param([int]$Size, [string]$OutFile)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 88, 101, 242))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $r = [int]($Size * 0.22)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
    $gp.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
    $gp.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
    $gp.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($bg, $gp)

    $fontSize = [single]($Size * 0.62)
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, [single]($Size * -0.04), $Size, $Size)
    $g.DrawString('Q', $font, [System.Drawing.Brushes]::White, $textRect, $sf)

    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function New-QIco {
    param([string]$OutFile)
    $sizes = @(16, 32, 48, 64, 128, 256)
    $images = @{}
    foreach ($s in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($s, $s)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
        $g.Clear([System.Drawing.Color]::Transparent)
        $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 88, 101, 242))
        $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
        $r = [int]($s * 0.22)
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
        $gp.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
        $gp.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
        $gp.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
        $gp.CloseFigure()
        $g.FillPath($bg, $gp)
        $fontSize = [single]($s * 0.62)
        $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $textRect = New-Object System.Drawing.RectangleF(0, [single]($s * -0.04), $s, $s)
        $g.DrawString('Q', $font, [System.Drawing.Brushes]::White, $textRect, $sf)
        $g.Dispose()
        $images[$s] = $bmp
    }

    $msList = @{}
    $totalSize = 0
    foreach ($s in $sizes) {
        $ms = New-Object System.IO.MemoryStream
        $images[$s].Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $msList[$s] = $ms.ToArray()
        $ms.Dispose()
        $totalSize += $msList[$s].Length
    }

    $fs = [System.IO.File]::Create($OutFile)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    foreach ($s in $sizes) {
        $w = if ($s -ge 256) { [byte]0 } else { [byte]$s }
        $h = if ($s -ge 256) { [byte]0 } else { [byte]$s }
        $bw.Write($w)
        $bw.Write($h)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$msList[$s].Length)
        $bw.Write([uint32]$offset)
        $offset += $msList[$s].Length
    }
    foreach ($s in $sizes) {
        $bw.Write($msList[$s])
    }
    $bw.Flush()
    $bw.Close()
    $fs.Close()

    foreach ($s in $sizes) { $images[$s].Dispose() }
}

New-QIcon -Size 32 -OutFile (Join-Path $out '32x32.png')
New-QIcon -Size 128 -OutFile (Join-Path $out '128x128.png')
New-QIcon -Size 256 -OutFile (Join-Path $out '128x128@2x.png')
New-QIcon -Size 512 -OutFile (Join-Path $out 'icon.png')
New-QIco -OutFile (Join-Path $out 'icon.ico')

Get-ChildItem $out | Format-Table Name, Length -AutoSize
