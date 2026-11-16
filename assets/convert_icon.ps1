$src = 'C:\Users\André\.gemini\antigravity\brain\845fa983-0d07-4b22-a8df-ed84e1bcdec8\.user_uploaded\media_1794856406923_233d2e9f.png'
$root = 'C:\Users\André\.gemini\antigravity\scratch\remotex'
$assetsDir = Join-Path $root 'assets'
$publicDir = Join-Path $root 'apps\desktop\public'

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

Copy-Item -Path $src -Destination (Join-Path $assetsDir 'icon.png') -Force
Copy-Item -Path $src -Destination (Join-Path $publicDir 'icon.png') -Force

Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile((Join-Path $assetsDir 'icon.png'))
$iconPath = Join-Path $assetsDir 'icon.ico'
$fs = [System.IO.File]::Create($iconPath)

# Standard Windows ICO header: 6 bytes
# 0-1: reserved (0), 2-3: image type (1 = icon), 4-5: number of images (1)
$fs.WriteByte(0); $fs.WriteByte(0)
$fs.WriteByte(1); $fs.WriteByte(0)
$fs.WriteByte(1); $fs.WriteByte(0)

# We can save as 256x256 or directly save PNG bytes into ICO
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose()
$bmp.Dispose()

$w = if ($bmp.Width -ge 256) { 0 } else { [byte]$bmp.Width }
$h = if ($bmp.Height -ge 256) { 0 } else { [byte]$bmp.Height }

# Directory entry: 16 bytes
$fs.WriteByte([byte]$w)          # width
$fs.WriteByte([byte]$h)          # height
$fs.WriteByte(0)                  # colors
$fs.WriteByte(0)                  # reserved
$fs.WriteByte(1); $fs.WriteByte(0)# color planes
$fs.WriteByte(32); $fs.WriteByte(0)# bits per pixel

# Size of image data (4 bytes)
$size = $pngBytes.Length
$fs.WriteByte([byte]($size -band 0xFF))
$fs.WriteByte([byte](($size -shr 8) -band 0xFF))
$fs.WriteByte([byte](($size -shr 16) -band 0xFF))
$fs.WriteByte([byte](($size -shr 24) -band 0xFF))

# Offset of image data from beginning of file (4 bytes): 6 + 16 = 22
$offset = 22
$fs.WriteByte([byte]($offset -band 0xFF))
$fs.WriteByte([byte](($offset -shr 8) -band 0xFF))
$fs.WriteByte([byte](($offset -shr 16) -band 0xFF))
$fs.WriteByte([byte](($offset -shr 24) -band 0xFF))

# Write PNG payload
$fs.Write($pngBytes, 0, $pngBytes.Length)
$fs.Flush()
$fs.Close()

Copy-Item -Path $iconPath -Destination (Join-Path $publicDir 'icon.ico') -Force
Copy-Item -Path $iconPath -Destination (Join-Path $root 'icon.ico') -Force

Write-Host "RemoteX Icon converted and deployed successfully!"

