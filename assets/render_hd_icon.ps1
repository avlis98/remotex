Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Squircle Background (Vibrant rounded rect)
$r = 110
$pad = 14
$w = $size - ($pad * 2)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($pad, $pad, $r, $r, 180, 90)
$path.AddArc($pad + $w - $r, $pad, $r, $r, 270, 90)
$path.AddArc($pad + $w - $r, $pad + $w - $r, $r, $r, 0, 90)
$path.AddArc($pad, $pad + $w - $r, $r, $r, 90, 90)
$path.CloseFigure()

$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($size, $size)),
    [System.Drawing.Color]::FromArgb(255, 0, 112, 243),
    [System.Drawing.Color]::FromArgb(255, 5, 20, 50)
)
$g.FillPath($bgBrush, $path)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 0, 194, 255), 4)
$g.DrawPath($borderPen, $path)

# Cyan Swoosh Arc (Wrapping the R)
$swooshPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 0, 194, 255), 20)
$swooshPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$swooshPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawArc($swooshPen, 70, 85, 360, 335, 110, 245)

# Bold "R" Letter
$rPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$stem = @(
    (New-Object System.Drawing.PointF(135, 120)),
    (New-Object System.Drawing.PointF(315, 120)),
    (New-Object System.Drawing.PointF(395, 175)),
    (New-Object System.Drawing.PointF(395, 250)),
    (New-Object System.Drawing.PointF(345, 300)),
    (New-Object System.Drawing.PointF(280, 315)),
    (New-Object System.Drawing.PointF(280, 318)),
    (New-Object System.Drawing.PointF(360, 420)),
    (New-Object System.Drawing.PointF(295, 420)),
    (New-Object System.Drawing.PointF(225, 318)),
    (New-Object System.Drawing.PointF(205, 318)),
    (New-Object System.Drawing.PointF(205, 420)),
    (New-Object System.Drawing.PointF(135, 420))
)
$rPath.AddPolygon($stem)

$inner = @(
    (New-Object System.Drawing.PointF(205, 185)),
    (New-Object System.Drawing.PointF(300, 185)),
    (New-Object System.Drawing.PointF(330, 210)),
    (New-Object System.Drawing.PointF(330, 245)),
    (New-Object System.Drawing.PointF(300, 265)),
    (New-Object System.Drawing.PointF(205, 265))
)
$rPath.AddPolygon($inner)

$rBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillPath($rBrush, $rPath)

# Cyan Arrow Cursor
$cursorPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$pts = @(
    (New-Object System.Drawing.PointF(315, 295)),
    (New-Object System.Drawing.PointF(420, 400)),
    (New-Object System.Drawing.PointF(370, 405)),
    (New-Object System.Drawing.PointF(355, 450)),
    (New-Object System.Drawing.PointF(315, 438)),
    (New-Object System.Drawing.PointF(330, 395)),
    (New-Object System.Drawing.PointF(285, 390))
)
$cursorPath.AddPolygon($pts)

$cBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 194, 255))
$g.FillPath($cBrush, $cursorPath)

$cPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 4)
$g.DrawPolygon($cPen, $pts)

$g.Dispose()

$outDir = 'C:\Users\André\projetos com IA\RemoteX\assets'
$pubDir = 'C:\Users\André\projetos com IA\RemoteX\apps\desktop\public'
$pngPath = Join-Path $outDir 'icon.png'
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item $pngPath (Join-Path $pubDir 'icon.png') -Force

# Generate crisp multi-size ICO
$icoPath = Join-Path $outDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$fs.WriteByte(0); $fs.WriteByte(0)
$fs.WriteByte(1); $fs.WriteByte(0)
$fs.WriteByte(1); $fs.WriteByte(0)

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()

$fs.WriteByte(0)                  # width (0 = 256)
$fs.WriteByte(0)                  # height (0 = 256)
$fs.WriteByte(0)
$fs.WriteByte(0)
$fs.WriteByte(1); $fs.WriteByte(0)
$fs.WriteByte(32); $fs.WriteByte(0)

$sizeLen = $pngBytes.Length
$fs.WriteByte([byte]($sizeLen -band 0xFF))
$fs.WriteByte([byte](($sizeLen -shr 8) -band 0xFF))
$fs.WriteByte([byte](($sizeLen -shr 16) -band 0xFF))
$fs.WriteByte([byte](($sizeLen -shr 24) -band 0xFF))

$offset = 22
$fs.WriteByte([byte]($offset -band 0xFF))
$fs.WriteByte([byte](($offset -shr 8) -band 0xFF))
$fs.WriteByte([byte](($offset -shr 16) -band 0xFF))
$fs.WriteByte([byte](($offset -shr 24) -band 0xFF))

$fs.Write($pngBytes, 0, $pngBytes.Length)
$fs.Flush()
$fs.Close()

Copy-Item $icoPath (Join-Path $pubDir 'icon.ico') -Force
Copy-Item $icoPath 'C:\Users\André\projetos com IA\RemoteX\icon.ico' -Force

$bmp.Dispose()
Write-Host "High-Resolution Icon PNG & ICO created with crisp vectors!" -ForegroundColor Green

