# ---------------------------------------------------------------------------
#  Agente de impresion del POS (Windows, PowerShell 5.1 o superior)
#
#  Corre en un computador del restaurante conectado a la misma red que las
#  impresoras termicas (IP, puerto 9100). Pregunta al servidor del POS si hay
#  comandas, recibos o reportes por imprimir y los envia a cada impresora.
#  No abre puertos: solo hace consultas HTTPS hacia el servidor.
#
#  Configuracion: config.json en la misma carpeta:
#    { "server": "https://pos.ejemplo.com", "token": "..." }
#  El instalador (Configuracion -> Impresoras -> Instalar agente) lo crea solo.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$Version = '1.1.0'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
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

while ($true) {
  try {
    if ($known.Count -gt 0 -and ((Get-Date) - $lastCheck).TotalSeconds -ge 30) {
      foreach ($p in $known) { $status[[string]$p.id] = Test-Port ([string]$p.ip) ([int]$p.port) 1500 }
      $lastCheck = Get-Date
    }
    $printers = @()
    foreach ($k in $status.Keys) { $printers += @{ id = [int]$k; online = [bool]$status[$k] } }
    $body = @{ version = $Version; hostname = $env:COMPUTERNAME; printers = $printers; ips = @(Get-LocalIps) }
    if ($null -ne $scan) { $body.scan = $scan }
    $res = Invoke-Api '/api/print-agent/poll' $body 45
    $scan = $null
    if ($errors -gt 0) { Write-Log 'Conexion con el servidor restablecida.'; $errors = 0 }
    if ($res.printers) {
      $newKnown = @($res.printers)
      $sigNew = ($newKnown | ForEach-Object { "$($_.id)@$($_.ip):$($_.port)" }) -join ','
      $sigOld = ($known | ForEach-Object { "$($_.id)@$($_.ip):$($_.port)" }) -join ','
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
        Send-Raw ([string]$job.ip) ([int]$job.port) ([Convert]::FromBase64String([string]$job.payload))
        Write-Log "Impreso #$($job.id) $($job.title) -> $($job.printer) ($($job.ip))"
      } catch {
        $ok = $false; $err = $_.Exception.Message
        Write-Log "ERROR #$($job.id) $($job.title): $err"
      }
      try { [void](Invoke-Api "/api/print-agent/jobs/$($job.id)/result" @{ ok = $ok; error = $err } 15) } catch { Write-Log "No se pudo reportar el trabajo #$($job.id): $($_.Exception.Message)" }
    }
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
