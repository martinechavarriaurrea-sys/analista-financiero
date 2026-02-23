$ErrorActionPreference = "Stop"

$oneDriveDir = "C:\Users\Martin Echavarria\OneDrive - Universidad EAFIT\Escritorio\Colfletar"
$localDir = "C:\Users\Martin Echavarria\Desktop\Colfletar"
$targetPpt = Join-Path $oneDriveDir "Colfletar_Presentacion_Redisenada.pptx"
$tmpPpt = Join-Path $oneDriveDir "Colfletar_Presentacion_Redisenada_tmp_modelo_limpio.pptx"
$backupPpt = Join-Path $oneDriveDir "Colfletar_Presentacion_Redisenada_backup_pre_modelo_limpio.pptx"
$reportJson = Join-Path $oneDriveDir "_modelo_limpio_reporte.json"

if (!(Test-Path $oneDriveDir)) {
  New-Item -ItemType Directory -Path $oneDriveDir -Force | Out-Null
}

if (!(Test-Path $targetPpt)) {
  $localPpt = Join-Path $localDir "Colfletar_Presentacion_Redisenada.pptx"
  if (Test-Path $localPpt) {
    Copy-Item $localPpt $targetPpt -Force
  } else {
    throw "No se encontró el PPT de trabajo en OneDrive ni Desktop."
  }
}

if (Test-Path $tmpPpt) {
  Remove-Item $tmpPpt -Force
}

if (!(Test-Path $backupPpt)) {
  Copy-Item $targetPpt $backupPpt -Force
}

function CleanText([string]$s) {
  if ($null -eq $s) { return "" }
  return (($s -replace "`r", "") -replace "`v", "").Trim()
}

function IsBrandText([string]$text) {
  if ($text -eq "COLFLETAR") { return $true }
  if ($text -match "^\d+/\d+$") { return $true }
  return $false
}

function GetContentTextShapes($slide) {
  $out = New-Object System.Collections.ArrayList
  foreach ($sh in @($slide.Shapes)) {
    try {
      if ($sh.HasTextFrame -eq -1 -and $sh.TextFrame.HasText -eq -1) {
        $t = CleanText($sh.TextFrame.TextRange.Text)
        if ($t.Length -gt 0 -and -not (IsBrandText $t)) {
          [void]$out.Add($sh)
        }
      }
    } catch {}
  }
  return @($out)
}

function GetPictureShapes($slide) {
  $pics = New-Object System.Collections.ArrayList
  foreach ($sh in @($slide.Shapes)) {
    try {
      if ($sh.Type -eq 13 -or $sh.Type -eq 11) {
        [void]$pics.Add($sh)
      }
    } catch {}
  }
  return @($pics)
}

function SetShapeFitInRect($shape, [double]$x, [double]$y, [double]$w, [double]$h) {
  if ($w -le 1 -or $h -le 1) { return }
  try { $shape.LockAspectRatio = -1 } catch {}

  $ow = [double]$shape.Width
  $oh = [double]$shape.Height
  if ($ow -le 0 -or $oh -le 0) {
    $shape.Left = $x
    $shape.Top = $y
    $shape.Width = $w
    $shape.Height = $h
    return
  }

  $ratio = $ow / $oh
  $nw = $w
  $nh = $nw / $ratio
  if ($nh -gt $h) {
    $nh = $h
    $nw = $nh * $ratio
  }

  $shape.Width = $nw
  $shape.Height = $nh
  $shape.Left = $x + (($w - $nw) / 2)
  $shape.Top = $y + (($h - $nh) / 2)
}

function ArrangePictures($pictures, [double]$x, [double]$y, [double]$w, [double]$h, [bool]$isTextHeavy) {
  $count = $pictures.Count
  if ($count -eq 0) { return }

  if ($count -eq 1) {
    SetShapeFitInRect $pictures[0] $x $y $w $h
    return
  }

  if ($count -eq 2 -and -not $isTextHeavy) {
    $gap = 6.0
    $h1 = ($h - $gap) * 0.62
    $h2 = ($h - $gap) - $h1
    SetShapeFitInRect $pictures[0] $x $y $w $h1
    SetShapeFitInRect $pictures[1] $x ($y + $h1 + $gap) $w $h2
    return
  }

  $cols = 2
  if ($count -ge 7) { $cols = 3 }
  if ($isTextHeavy -and $count -ge 3) { $cols = 3 }
  $rows = [Math]::Ceiling($count / $cols)
  $gap = 6.0
  $cellW = ($w - (($cols - 1) * $gap)) / $cols
  $cellH = ($h - (($rows - 1) * $gap)) / $rows

  for ($i = 0; $i -lt $count; $i++) {
    $r = [Math]::Floor($i / $cols)
    $c = $i % $cols
    $cx = $x + ($c * ($cellW + $gap))
    $cy = $y + ($r * ($cellH + $gap))
    SetShapeFitInRect $pictures[$i] $cx $cy $cellW $cellH
  }
}

function GetBodyFontSize([int]$chars) {
  if ($chars -ge 2600) { return 6.8 }
  if ($chars -ge 2000) { return 7.4 }
  if ($chars -ge 1600) { return 8.0 }
  if ($chars -ge 1200) { return 8.8 }
  if ($chars -ge 900) { return 9.5 }
  if ($chars -ge 650) { return 10.5 }
  if ($chars -ge 450) { return 11.5 }
  return 12.5
}

function StyleContentText($shape) {
  $raw = $shape.TextFrame.TextRange.Text
  $chars = (($raw -replace "\s", "").Length)
  $bodySize = GetBodyFontSize $chars

  $tr = $shape.TextFrame.TextRange
  $tr.Font.Name = "Montserrat"
  $tr.Font.Size = $bodySize
  $tr.Font.Bold = 0
  $tr.Font.Color.RGB = 5658198

  try {
    $tr.ParagraphFormat.Alignment = 1
    $tr.ParagraphFormat.SpaceBefore = 0
    $tr.ParagraphFormat.SpaceAfter = 4
    $tr.ParagraphFormat.SpaceWithin = 1.08
    $tr.ParagraphFormat.Bullet.Visible = 0
  } catch {}

  $pCount = $tr.Paragraphs().Count
  if ($pCount -ge 1) {
    $p1 = $tr.Paragraphs(1)
    $title = CleanText($p1.Text)
    if ($title.Length -gt 0 -and $title.Length -le 90) {
      $titleSize = [Math]::Min(22, [Math]::Max(16, $bodySize + 8))
      $p1.Font.Name = "Montserrat"
      $p1.Font.Size = $titleSize
      $p1.Font.Bold = -1
      $p1.Font.Color.RGB = 1386261
      try { $p1.ParagraphFormat.SpaceAfter = 8 } catch {}
    }
  }

  for ($p = 2; $p -le $pCount; $p++) {
    $pr = $tr.Paragraphs($p)
    $line = CleanText($pr.Text)
    if ($line.StartsWith("•")) {
      try {
        $newText = $line.TrimStart("•").Trim()
        if ($newText.Length -gt 0) { $pr.Text = $newText }
        $pr.ParagraphFormat.Bullet.Visible = -1
      } catch {}
    } elseif ($line.StartsWith("- ")) {
      try {
        $newText = $line.Substring(2).Trim()
        if ($newText.Length -gt 0) { $pr.Text = $newText }
        $pr.ParagraphFormat.Bullet.Visible = -1
      } catch {}
    }
  }

  $shape.TextFrame.WordWrap = -1
  $shape.TextFrame.MarginLeft = 10
  $shape.TextFrame.MarginRight = 10
  $shape.TextFrame.MarginTop = 6
  $shape.TextFrame.MarginBottom = 6
  try { $shape.TextFrame2.WordWrap = -1 } catch {}
  try { $shape.TextFrame2.AutoSize = 2 } catch {}
}

$pp = New-Object -ComObject PowerPoint.Application
$pp.Visible = -1
$log = New-Object System.Collections.ArrayList

try {
  $pres = $pp.Presentations.Open($targetPpt, $false, $false, $false)

  $slideW = [double]$pres.PageSetup.SlideWidth
  $slideH = [double]$pres.PageSetup.SlideHeight

  $safeTop = 22.0
  $safeBottom = $slideH - 22.0
  $safeLeft = 24.0
  $safeRight = $slideW - 24.0
  $safeH = $safeBottom - $safeTop
  $safeW = $safeRight - $safeLeft

  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $slide = $pres.Slides.Item($i)
    $contentShapes = GetContentTextShapes $slide
    $pictures = GetPictureShapes $slide

    $contentShape = $null
    if ($contentShapes.Count -gt 0) {
      $ordered = $contentShapes | Sort-Object Top, Left
      $contentShape = $ordered[0]

      if ($ordered.Count -gt 1) {
        $joined = (($ordered | ForEach-Object { $_.TextFrame.TextRange.Text.Trim() }) -join "`r`n")
        $contentShape.TextFrame.TextRange.Text = $joined
        for ($k = $ordered.Count - 1; $k -ge 1; $k--) {
          try { $ordered[$k].Delete() } catch {}
        }
      }
    }

    $contentLen = 0
    if ($null -ne $contentShape) {
      $contentLen = (($contentShape.TextFrame.TextRange.Text -replace "\s", "").Length)
    }
    $isTextHeavy = $contentLen -ge 1400

    if ($null -eq $contentShape) {
      [void]$log.Add([pscustomobject]@{
        Slide = $i; Changed = $false; Reason = "Sin texto de contenido"; Pictures = $pictures.Count
      })
      continue
    }

    if ($pictures.Count -eq 0) {
      $contentShape.Left = $safeLeft
      $contentShape.Top = $safeTop
      $contentShape.Width = $safeW
      $contentShape.Height = $safeH
    } elseif ($isTextHeavy) {
      $imageAreaX = $safeLeft
      $imageAreaY = $safeBottom - 90.0
      $imageAreaW = 320.0
      $imageAreaH = 70.0

      $textX = $safeLeft
      $textY = $safeTop
      $textW = $safeW
      $textH = $safeH - 96.0

      ArrangePictures $pictures $imageAreaX $imageAreaY $imageAreaW $imageAreaH $true
      $contentShape.Left = $textX
      $contentShape.Top = $textY
      $contentShape.Width = $textW
      $contentShape.Height = $textH
    } else {
      $imgX = $safeLeft
      $imgY = $safeTop + 14.0
      $imgW = 320.0
      $imgH = $safeH - 18.0

      $textX = $imgX + $imgW + 14.0
      $textY = $safeTop
      $textW = $safeRight - $textX
      $textH = $safeH

      ArrangePictures $pictures $imgX $imgY $imgW $imgH $false
      $contentShape.Left = $textX
      $contentShape.Top = $textY
      $contentShape.Width = $textW
      $contentShape.Height = $textH
    }

    StyleContentText $contentShape
    try { $contentShape.ZOrder(0) } catch {}

    [void]$log.Add([pscustomobject]@{
      Slide = $i
      Changed = $true
      Pictures = $pictures.Count
      TextChars = $contentLen
      TextHeavy = $isTextHeavy
    })
  }

  $pres.SaveAs($tmpPpt)
  $pres.Close()
} finally {
  $pp.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp) | Out-Null
}

if (!(Test-Path $tmpPpt)) {
  throw "No se generó el archivo temporal de salida."
}

Move-Item $tmpPpt $targetPpt -Force

if (Test-Path $localDir) {
  Copy-Item $targetPpt (Join-Path $localDir "Colfletar_Presentacion_Redisenada.pptx") -Force
}

$log | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $reportJson

Write-Output "OK: Modelo limpio aplicado en todos los slides."
Write-Output "PPT: $targetPpt"
Write-Output "REPORTE: $reportJson"
