$ErrorActionPreference = "Stop"

$pptPath = "C:\Users\Martin Echavarria\OneDrive - Universidad EAFIT\Escritorio\Colfletar\Colfletar_Presentacion_Redisenada.pptx"
$backup = "C:\Users\Martin Echavarria\OneDrive - Universidad EAFIT\Escritorio\Colfletar\Colfletar_Presentacion_Redisenada_backup_pre_refinado_5_slides.pptx"
$tmp = "C:\Users\Martin Echavarria\OneDrive - Universidad EAFIT\Escritorio\Colfletar\Colfletar_Presentacion_Redisenada_tmp_refinado_5_slides.pptx"

if (!(Test-Path $pptPath)) {
  throw "No existe: $pptPath"
}
if (!(Test-Path $backup)) {
  Copy-Item $pptPath $backup -Force
}
if (Test-Path $tmp) {
  Remove-Item $tmp -Force
}

function CleanText([string]$s) {
  if ($null -eq $s) { return "" }
  return (($s -replace "`r", "") -replace "`v", "").Trim()
}

function IsBrand([string]$t) {
  if ($t -eq "COLFLETAR") { return $true }
  if ($t -match "^\d+/\d+$") { return $true }
  return $false
}

$content = @{}

$content[2] = @"
PREGUNTAS ORIENTADORAS

¿Cuáles son los enfoques de la naturaleza humana planteados por Cantoni?
Cantoni plantea que la naturaleza humana se comprende desde varios enfoques: psicológico (historia personal, personalidad, motivaciones y aprendizaje), biológico (predisposiciones y límites físicos como estrés y energía), antropológico (cultura, normas, lenguaje y pertenencia) y neurofisiológico (cerebro, emociones y toma de decisiones).

¿Cuáles son las inteligencias múltiples que propone Howard Gardner?
Gardner propone inteligencias como lingüística, lógico-matemática, espacial, musical, corporal-kinestésica, interpersonal, intrapersonal y naturalista.

¿Qué plantea Daniel Goleman frente a la inteligencia emocional?
Goleman plantea que la inteligencia emocional es la capacidad de reconocer y regular emociones propias, comprender las de otros (empatía) y manejar relaciones de forma efectiva.

¿Cuáles tipos de liderazgo expone Porret?
Porret expone estilos de liderazgo como autoritario/directivo, democrático/participativo y delegativo (laissez-faire).
"@

$content[8] = @"
INTELIGENCIA EMOCIONAL

Viejo:
• No presenta una inteligencia emocional desarrollada.
• Dificultad para manejar la frustración.
• Baja autorregulación emocional.
• Externaliza su inseguridad a través de la microgestión.
• No reconoce el impacto de su comportamiento en el otro socio.

Joven:
• Inteligencia emocional parcial.
• Reconoce sus emociones (molestia, inconformidad).
• Tiene autocontrol en términos operativos.
• Presenta dificultad para gestionar el conflicto de manera asertiva, ya que la situación le genera rechazo y tensión constante.

Líder (Santiago Lloreda):
• Baja inteligencia emocional aplicada al liderazgo.
• Evita el conflicto en lugar de gestionarlo.
• No ejerce empatía organizacional (no protege a ninguna de las partes).
• Carece de habilidades de intervención emocional y mediación.
"@

$content[10] = @"
CUARTILLA

En la empresa de servicios de transporte marítimo se identifican tres actores clave: el socio con mayor antigüedad, el socio con mayor participación en las ventas y el líder formal de la organización. Si bien existe un conflicto relacional y de liderazgo entre ellos, es importante resaltar que dicho conflicto no ha impactado negativamente la gestión comercial, la cual se mantiene sólida y productiva.

El socio con mayor antigüedad en la empresa ha realizado aportes significativos a lo largo de sus años de permanencia. Entre sus principales fortalezas se encuentra el conocimiento histórico del negocio, la experiencia acumulada en el sector y su compromiso con la organización. Su interés constante por los procesos refleja un alto nivel de involucramiento y sentido de pertenencia. No obstante, uno de los principales aspectos por mejorar radica en su dificultad para adaptarse a los cambios y a las nuevas dinámicas de liderazgo. Su tendencia a intervenir en funciones que no le corresponden genera tensiones internas y evidencia la necesidad de fortalecer su capacidad de autorregulación emocional y respeto por los límites organizacionales. A pesar de ello, su contribución estratégica y su experiencia continúan siendo un activo importante para la empresa.

Por su parte, el socio con mayor participación en las ventas se destaca por su alto desempeño comercial y su orientación clara a resultados. Su capacidad para generar ingresos, tomar decisiones eficientes y asumir responsabilidades demuestra un liderazgo efectivo en el área operativa y comercial. Entre sus fortalezas se encuentran la autonomía, la disciplina y el enfoque en el logro de objetivos, lo que ha permitido que la empresa mantenga un buen posicionamiento en el mercado. Como aspecto por mejorar, se identifica la necesidad de fortalecer sus habilidades para gestionar conflictos interpersonales, especialmente en contextos donde existen diferencias de criterio o intromisiones externas. Aun así, su contribución es fundamental para la sostenibilidad y el crecimiento económico de la organización.

Finalmente, el líder formal de la empresa aporta a la organización desde un rol orientado a la estabilidad y la armonía. Su principal fortaleza radica en su disposición a delegar y permitir que cada socio desarrolle su labor con autonomía, lo cual ha favorecido el buen desempeño comercial. Sin embargo, su estilo de liderazgo pasivo representa un aspecto crítico por mejorar, ya que la falta de intervención oportuna frente a los conflictos ha permitido la invasión de roles y la acumulación de tensiones. Para fortalecer su contribución, resulta necesario que asuma un liderazgo más activo, estableciendo límites claros, mediando en los desacuerdos y promoviendo una comunicación asertiva entre los socios.
"@

$content[16] = @"
QUIÉN SOY?

Soy una persona que se define por tres cosas: integridad, curiosidad y capacidad de mantener la calma. Me muevo bien en entornos cambiantes porque soy flexible: cuando el contexto se pone difícil, tiendo a enfocarme, organizarme y buscar soluciones realistas en lugar de quedarme en la queja. Me gusta entender qué está pasando de verdad detrás de los problemas, por eso observo mucho, hago preguntas y procuro escuchar antes de tomar decisiones.

Vengo de una historia familiar donde el trabajo se entiende como algo que debe dejar huella en otros. En mi familia he visto ejemplos de empresas que no solo producen, sino que también forman personas, apoyan educación y crean oportunidades. Eso me marcó: para mí, el éxito no solo se mide por resultados, sino por la manera en que se logran. Me importa que los acuerdos sean justos y que la contraparte también gane; no me interesa pasar por encima de nadie para cumplir una meta.

En lo personal, tengo experiencia en entornos industriales (especialmente en lo metalmecánico) y también he estado cerca de proyectos con enfoque financiero. Me gusta trabajar donde hay retos reales: presupuestos, decisiones, prioridades, crisis o momentos en los que se necesita claridad. Ahí siento que doy mi mejor versión: analizo, ordeno, hago escenarios y propongo caminos concretos. Me considero una persona con buena comunicación: no solo hablo, también sé traducir ideas complejas a cosas simples cuando el equipo lo necesita.

A la vez, reconozco un rasgo que me reta: soy obsesivo con las metas. Cuando algo me importa, puedo enfocarme tanto que descuido el equilibrio personal (descanso, tiempo social o incluso el disfrute). Esto me ha servido para lograr cosas, pero también me obliga a aprender a poner límites, porque la disciplina sin equilibrio puede terminar quitando energía y afectando relaciones. Mi trabajo consciente es no confundir exigencia con autoexigencia destructiva.

En mis relaciones, suelo ser leal y directo. Me parezco a otros en que también tengo inseguridades y momentos de duda, pero me diferencio en que no huyo del problema: lo enfrento. Si me equivoco, prefiero reconocerlo y corregir rápido. En equipo, tiendo a ser de los que aportan estructura y serenidad; me sale natural sostener el ambiente cuando hay tensión. Sin embargo, también estoy aprendiendo a delegar más y a confiar en que no todo debe pasar por mí para salir bien.
"@

$content[20] = @"
QUIÉN SOY?

Mi nombre es Maximiliano Restrepo Vélez, tengo 19 años y soy una persona apasionada por el mundo de los carros y los deportes. Desde siempre me ha gustado entender cómo funcionan las cosas, analizar detalles y esforzarme por mejorar en lo que hago.

Me considero una persona reservada, enfocada y disciplinada. No soy alguien que hable demasiado, pero sí observo mucho y pienso antes de actuar. Me gusta trabajar en silencio, concentrarme en mis objetivos y buscar buenos resultados, tanto en lo académico como en lo personal. Creo que la constancia y la disciplina son claves para lograr lo que uno se propone. Siempre he sido muy disciplinado y lo aplico mucho en cualquier cosa que haga, ya sea algo personal o de trabajo.

Soy muy tranquilo, no me gustan mucho las fiestas ni los planes alborotados, prefiero mantener mi calma y mi estrés al mínimo. Sí soy una persona social, pero muy selectivo con el tipo de cosas que hago.

Lo que me diferencia de los demás es mi forma de ver las cosas con calma y estrategia. No me dejo llevar fácilmente por la presión o por lo que hacen los otros; prefiero avanzar a mi ritmo, pero con seguridad. También me caracteriza mi interés por aprender, mi capacidad de concentración y mi gusto por mejorar cada día.

Al mismo tiempo, me asimilo a otras personas de mi edad en que tengo metas, sueños y ganas de crecer. Comparto mucho con personas con interés por los deportes, la búsqueda de éxito y el deseo de construir un buen futuro.

En general, me defino como alguien tranquilo, observador y determinado, que sabe lo que quiere y trabaja para conseguirlo.
"@

$bodySize = @{ 2 = 10.5; 8 = 10.0; 10 = 8.2; 16 = 7.9; 20 = 8.8 }
$titleSize = @{ 2 = 20.0; 8 = 19.0; 10 = 17.0; 16 = 17.0; 20 = 17.0 }

$pp = New-Object -ComObject PowerPoint.Application
$pp.Visible = -1

try {
  $pres = $pp.Presentations.Open($pptPath, $false, $false, $false)
  $slideW = [double]$pres.PageSetup.SlideWidth
  $slideH = [double]$pres.PageSetup.SlideHeight

  foreach ($idx in @(2, 8, 10, 16, 20)) {
    $slide = $pres.Slides.Item($idx)

    $pics = @()
    foreach ($sh in @($slide.Shapes)) {
      try {
        if ($sh.Type -eq 13 -or $sh.Type -eq 11) {
          $pics += [pscustomobject]@{
            L = [double]$sh.Left
            T = [double]$sh.Top
            W = [double]$sh.Width
            H = [double]$sh.Height
          }
        }
      } catch {}
    }

    $textLeft = 380.0
    if ($pics.Count -gt 0) {
      $maxR = ($pics | ForEach-Object { $_.L + $_.W } | Measure-Object -Maximum).Maximum
      $textLeft = [Math]::Max(360.0, $maxR + 14.0)
    }
    $textTop = 24.0
    $textWidth = $slideW - $textLeft - 24.0
    $textHeight = $slideH - $textTop - 24.0

    $toDelete = @()
    foreach ($sh in @($slide.Shapes)) {
      try {
        if ($sh.HasTextFrame -eq -1 -and $sh.TextFrame.HasText -eq -1) {
          $t = CleanText($sh.TextFrame.TextRange.Text)
          if ($t.Length -gt 0 -and -not (IsBrand $t)) {
            $toDelete += $sh
          }
        }
      } catch {}
    }
    foreach ($sh in $toDelete) {
      try { $sh.Delete() } catch {}
    }

    $tb = $slide.Shapes.AddTextbox(1, $textLeft, $textTop, $textWidth, $textHeight)
    $tb.Name = "Contenido_Slide_$idx"
    $tb.TextFrame.WordWrap = -1
    $tb.TextFrame.MarginLeft = 10
    $tb.TextFrame.MarginRight = 10
    $tb.TextFrame.MarginTop = 6
    $tb.TextFrame.MarginBottom = 6
    try { $tb.TextFrame2.WordWrap = -1 } catch {}

    $txt = $content[$idx].Trim()
    $tb.TextFrame.TextRange.Text = $txt
    $tr = $tb.TextFrame.TextRange

    $tr.Font.Name = "Montserrat"
    $tr.Font.Size = [double]$bodySize[$idx]
    $tr.Font.Bold = 0
    $tr.Font.Color.RGB = 5658198

    try {
      $tr.ParagraphFormat.Alignment = 1
      $tr.ParagraphFormat.SpaceBefore = 0
      $tr.ParagraphFormat.SpaceAfter = 4
      $tr.ParagraphFormat.SpaceWithin = 1.08
    } catch {}

    $p1 = $tr.Paragraphs(1)
    $p1.Font.Name = "Montserrat"
    $p1.Font.Size = [double]$titleSize[$idx]
    $p1.Font.Bold = -1
    $p1.Font.Color.RGB = 1386261
    try {
      $p1.ParagraphFormat.SpaceAfter = 10
    } catch {}

    if ($idx -eq 8) {
      $pCount = $tr.Paragraphs().Count
      for ($p = 2; $p -le $pCount; $p++) {
        $pt = CleanText($tr.Paragraphs($p).Text)
        if ($pt -match "^(Viejo:|Joven:|Líder \(Santiago Lloreda\):)$") {
          $rp = $tr.Paragraphs($p)
          $rp.Font.Bold = -1
          $rp.Font.Color.RGB = 1386261
          $rp.Font.Size = 11.5
          try {
            $rp.ParagraphFormat.SpaceBefore = 5
            $rp.ParagraphFormat.SpaceAfter = 3
          } catch {}
        }
      }
    }

    try { $tb.TextFrame2.AutoSize = 2 } catch {}
  }

  $pres.SaveAs($tmp)
  $pres.Close()
} finally {
  $pp.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp) | Out-Null
}

if (!(Test-Path $tmp)) {
  throw "No se generó archivo temporal."
}
Move-Item $tmp $pptPath -Force

$pp2 = New-Object -ComObject PowerPoint.Application
$pp2.Visible = -1
try {
  $p2 = $pp2.Presentations.Open($pptPath, $false, $true, $false)
  foreach ($idx in @(2, 8, 10, 16, 20)) {
    $s = $p2.Slides.Item($idx)
    $count = 0
    foreach ($sh in @($s.Shapes)) {
      try {
        if ($sh.HasTextFrame -eq -1 -and $sh.TextFrame.HasText -eq -1) {
          $t = CleanText($sh.TextFrame.TextRange.Text)
          if ($t.Length -gt 0 -and -not (IsBrand $t)) { $count++ }
        }
      } catch {}
    }
    Write-Output "Slide $idx -> cuadros de texto de contenido: $count"
  }
  $p2.Close()
} finally {
  $pp2.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pp2) | Out-Null
}

Write-Output "OK: Refinado completado en slides 2, 8, 10, 16 y 20."
