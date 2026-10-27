# ---------------------------------------------------------------------------
#  Agente de impresion del POS (Windows, PowerShell 5.1 o superior)
#
#  Corre en un computador del restaurante conectado a la misma red que las
#  impresoras termicas (IP, puerto 9100) o con impresoras USB instaladas en
#  Windows. Pregunta al servidor del POS si hay comandas, recibos o reportes
#  por imprimir y los envia a cada impresora. Se actualiza solo cuando el
#  servidor tiene una version nueva.
#  No abre puertos: solo hace consultas HTTPS hacia el servidor.
#  Solo caracteres ASCII (PowerShell 5.1 lee el archivo sin BOM como ANSI).
#
#  Configuracion: config.json en la misma carpeta:
#    { "server": "https://pos.ejemplo.com", "token": "..." }
#  El instalador (Configuracion -> Impresoras -> Instalar agente) lo crea solo.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$Version = '1.2.1'
$Self = $MyInvocation.MyCommand.Path
$Dir = Split-Path -Parent $Self
$CfgPath = Join-Path $Dir 'config.json'
$LogPath = Join-Path $Dir 'agente.log'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  try {
    if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt 2MB)) { Move-Item $LogPath ($LogPath + '.old') -Force }
    Add-Content -Path $LogPath -Value $line
  } catch {}
}

# Una sola copia del agente a la vez
$mutex = New-Object System.Threading.Mutex($false, 'Local\AgenteImpresionPOS')
if (-not $mutex.WaitOne(0)) { Write-Log 'El agente ya esta corriendo.'; exit 0 }

if (-not (Test-Path $CfgPath)) { Write-Log "Falta $CfgPath. Vuelve a ejecutar el instalador."; exit 1 }
$cfg = Get-Content $CfgPath -Raw | ConvertFrom-Json
$Server = ([string]$cfg.server).TrimEnd('/')
$Headers = @{ 'X-Agent-Token' = [string]$cfg.token }

function Send-Raw([string]$ip, [int]$port, [byte[]]$bytes) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($ip, $port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(4000)) { throw "La impresora $ip no responde (apagada, sin red o IP equivocada)" }
    try { $client.EndConnect($iar) } catch { throw "La impresora $($ip):$port no responde (apagada, sin red, IP o puerto equivocado)" }
    $stream = $client.GetStream()
    $stream.WriteTimeout = 10000
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    Start-Sleep -Milliseconds 250
  } finally { $client.Close() }
}

# Impresoras USB: los datos ESC/POS van en crudo (RAW) a la cola de Windows de la impresora, por su nombre
$RawSrc = @'
using System;
using System.Runtime.InteropServices;
public static class PosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DocInfo di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  // Devuelve el numero del trabajo en la cola de Windows, para vigilar que salga
  public static int Send(string printer, string title, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Windows no tiene la impresora '" + printer + "' (revisa que este instalada con ese nombre)");
    try {
      DocInfo di = new DocInfo(); di.pDocName = title; di.pDataType = "RAW";
      int job = StartDocPrinter(h, 1, di);
      if (job == 0) throw new Exception("Windows no acepto el trabajo (error " + Marshal.GetLastWin32Error() + ")");
      try {
        StartPagePrinter(h);
        int written;
        if (!WritePrinter(h, data, data.Length, out written) || written != data.Length) throw new Exception("No se pudo enviar a la impresora (error " + Marshal.GetLastWin32Error() + ")");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
      return job;
    } finally { ClosePrinter(h); }
  }
}
'@
try { Add-Type -TypeDefinition $RawSrc -Language CSharp -ErrorAction Stop } catch { Write-Log "No se pudo preparar la impresion USB: $($_.Exception.Message)" }

function Send-Usb([string]$name, [string]$title, [byte[]]$bytes) {
  if (-not ('PosRawPrinter' -as [type])) { throw 'Este computador no pudo preparar la impresion USB (mira agente.log)' }
  $jid = 0
  try { $jid = [PosRawPrinter]::Send($name, $title, $bytes) } catch { if ($_.Exception.InnerException) { throw $_.Exception.InnerException.Message } throw }
  # Windows lo entrega a la impresora en segundos. Si a los 20 s sigue en la cola (apagada, sin cable o marcada "sin
  # conexion"), se saca de la cola y se avisa, para que no salga de golpe mas tarde.
  $job = $null
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    try { $job = Get-PrintJob -PrinterName $name -ID $jid -ErrorAction Stop } catch { return }
    if ($null -eq $job) { return }
    if ("$($job.JobStatus)" -match 'Error|Offline|PaperOut|UserIntervention|Blocked') { break }
    Start-Sleep -Milliseconds 500
  }
  $st = "$($job.JobStatus)"
  try { Remove-PrintJob -InputObject $job -ErrorAction Stop } catch {}
  $p = Get-WinPrinters | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if ($p -and $p.hold) { throw "Windows tiene a $name marcada 'sin conexion': abre la impresora en Windows > Ver lo que se esta imprimiendo > menu Impresora > desmarca 'Usar impresora sin conexion'" }
  throw "Windows no pudo entregar el trabajo a $name (estado: $st): revisa que este encendida y con el cable USB conectado"
}

# Impresoras instaladas en Windows, con si estan desconectadas (cable USB suelto o apagada)
function Get-WinPrinters {
  $list = @()
  try { $list = @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch { try { $list = @(Get-WmiObject Win32_Printer -ErrorAction Stop) } catch { $list = @() } }
  # hold = Windows la tiene "fuera de linea" y guarda los trabajos sin imprimirlos hasta que vuelva
  return ,@($list | ForEach-Object { @{ name = [string]$_.Name; port = [string]$_.PortName; hold = [bool]$_.WorkOffline; offline = [bool]($_.WorkOffline -or $_.PrinterStatus -eq 7 -or $_.ExtendedPrinterStatus -eq 7 -or $_.DetectedErrorState -eq 9) } })
}

# Descarga la version nueva del agente, revisa que este completa y se reinicia con ella
function Update-Agent([string]$v) {
  $script:UpdateTried = $true
  try {
    $text = [string](Invoke-WebRequest -UseBasicParsing -Uri ($Server + '/api/print-agent/script') -TimeoutSec 30).Content
    $errs = $null
    [void][System.Management.Automation.PSParser]::Tokenize($text, [ref]$errs)
    if (-not $text.Contains("`$Version = '$v'") -or -not $text.Contains('Invoke-Api') -or ($errs -and $errs.Count)) { Write-Log "La version $v descargada no esta completa; sigo con la $Version."; return }
    Copy-Item $Self ($Self + '.bak') -Force
    [System.IO.File]::WriteAllText($Self, $text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Log "Agente actualizado a la version $v. Reiniciando..."
    $mutex.ReleaseMutex(); $mutex.Dispose()
    Start-Process powershell.exe -WindowStyle Hidden -WorkingDirectory $Dir -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $Self + '"'))
    exit 0
  } catch { Write-Log "No se pudo actualizar el agente: $($_.Exception.Message)" }
}

function Test-Port([string]$ip, [int]$port, [int]$ms) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect($ip, $port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($ms)) { return $false }
    $c.EndConnect($iar)
    return $true
  } catch { return $false } finally { $c.Close() }
}

function Get-LocalIps {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress })
  } catch {
    return @([System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -notlike '127.*' } | ForEach-Object { $_.ToString() })
  }
}

# IPs con las que suelen venir de fabrica las impresoras POS de red (Xprinter, Digital POS, 3nStar, Epson...)
$FactoryIps = @('192.168.123.100', '192.168.1.87', '192.168.0.87', '192.168.1.100', '192.168.0.100', '192.168.1.200', '192.168.0.200', '192.168.192.168', '192.168.1.114', '10.0.0.100')

# Busca impresoras (puerto 9100 abierto) en las redes locales /24 del computador y en las IPs de fabrica
function Find-Printers {
  $bases = @()
  try {
    $bases = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { ($_.IPAddress -split '\.')[0..2] -join '.' }
  } catch {
    $bases = [System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME) |
      Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -notlike '127.*' } |
      ForEach-Object { ($_.ToString() -split '\.')[0..2] -join '.' }
  }
  $found = New-Object System.Collections.ArrayList
  $extra = @()
  foreach ($ip in $FactoryIps) { $c = New-Object System.Net.Sockets.TcpClient; $extra += ,@($ip, $c, $c.BeginConnect($ip, 9100, $null, $null)) }
  foreach ($base in ($bases | Select-Object -Unique)) {
    $pending = @()
    for ($i = 1; $i -le 254; $i++) {
      $ip = "$base.$i"
      $c = New-Object System.Net.Sockets.TcpClient
      $pending += ,@($ip, $c, $c.BeginConnect($ip, 9100, $null, $null))
    }
    Start-Sleep -Milliseconds 1500
    foreach ($p in $pending) {
      if ($p[2].IsCompleted -and $p[1].Connected) { [void]$found.Add($p[0]) }
      try { $p[1].Close() } catch {}
    }
  }
  Start-Sleep -Milliseconds 500
  foreach ($p in $extra) {
    if ($p[2].IsCompleted -and $p[1].Connected -and -not $found.Contains($p[0])) { [void]$found.Add($p[0]) }
    try { $p[1].Close() } catch {}
  }
  return ,$found.ToArray()
}

function Invoke-Api([string]$path, $body, [int]$timeout) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri ($Server + $path) -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec $timeout -UseBasicParsing
}

Write-Log "Agente de impresion $Version iniciado -> $Server"
$status = @{}
$known = @()
$lastCheck = [datetime]::MinValue
$scan = $null
$errors = 0
$UpdateTried = $false

while ($true) {
  try {
    $win = $null
    if (((Get-Date) - $lastCheck).TotalSeconds -ge 30) {
      $win = Get-WinPrinters
      foreach ($p in $known) {
        if ([string]$p.conn -eq 'usb') {
          $w = $win | Where-Object { $_.name -eq [string]$p.winName } | Select-Object -First 1
          $status[[string]$p.id] = [bool]($w -and -not $w.offline)
        } else { $status[[string]$p.id] = Test-Port ([string]$p.ip) ([int]$p.port) 1500 }
      }
      $lastCheck = Get-Date
    }
    $printers = @()
    foreach ($k in $status.Keys) { $printers += @{ id = [int]$k; online = [bool]$status[$k] } }
    $body = @{ version = $Version; hostname = $env:COMPUTERNAME; printers = $printers; ips = @(Get-LocalIps) }
    if ($null -ne $win) { $body.winPrinters = $win }
    if ($null -ne $scan) { $body.scan = $scan }
    $res = Invoke-Api '/api/print-agent/poll' $body 45
    $scan = $null
    if ($errors -gt 0) { Write-Log 'Conexion con el servidor restablecida.'; $errors = 0 }
    if ($res.printers) {
      $newKnown = @($res.printers)
      $sigNew = ($newKnown | ForEach-Object { "$($_.id)@$($_.conn)$($_.winName)$($_.ip):$($_.port)" }) -join ','
      $sigOld = ($known | ForEach-Object { "$($_.id)@$($_.conn)$($_.winName)$($_.ip):$($_.port)" }) -join ','
      if ($sigNew -ne $sigOld) { $lastCheck = [datetime]::MinValue }
      $known = $newKnown
    }
    if ($res.scan) {
      Write-Log 'Buscando impresoras en la red (puerto 9100)...'
      $scan = Find-Printers
      Write-Log ('Encontradas: ' + ($(if ($scan.Count) { $scan -join ', ' } else { 'ninguna' })))
    }
    foreach ($job in @($res.jobs)) {
      if ($null -eq $job) { continue }
      $ok = $true; $err = ''
      try {
        $bytes = [Convert]::FromBase64String([string]$job.payload)
        if ([string]$job.conn -eq 'usb') {
          Send-Usb ([string]$job.winName) ([string]$job.title) $bytes
          Write-Log "Impreso #$($job.id) $($job.title) -> $($job.printer) (USB $($job.winName))"
        } else {
          Send-Raw ([string]$job.ip) ([int]$job.port) $bytes
          Write-Log "Impreso #$($job.id) $($job.title) -> $($job.printer) ($($job.ip))"
        }
      } catch {
        $ok = $false; $err = $_.Exception.Message
        Write-Log "ERROR #$($job.id) $($job.title): $err"
      }
      try { [void](Invoke-Api "/api/print-agent/jobs/$($job.id)/result" @{ ok = $ok; error = $err } 15) } catch { Write-Log "No se pudo reportar el trabajo #$($job.id): $($_.Exception.Message)" }
    }
    # Despues de imprimir lo pendiente, y una sola vez por arranque
    if ($res.agentVersion -and [string]$res.agentVersion -ne $Version -and -not $UpdateTried) { Update-Agent ([string]$res.agentVersion) }
  } catch {
    $errors++
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 401) {
      Write-Log 'Token invalido o agente eliminado. Instala de nuevo desde Configuracion -> Impresoras.'
      Start-Sleep -Seconds 60
    } else {
      if ($errors -le 3 -or $errors % 20 -eq 0) { Write-Log "Sin conexion con el servidor ($errors): $($_.Exception.Message)" }
      Start-Sleep -Seconds ([Math]::Min(30, 2 * $errors))
    }
  }
}
