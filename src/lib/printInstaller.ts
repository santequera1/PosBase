/** Instalador para Windows: descarga el agente, guarda la configuración y lo deja arrancando con Windows. */
export function buildInstaller(server: string, token: string): string {
  const lines = [
    '@echo off',
    'title Instalador del agente de impresion del POS',
    'set "DIR=%LOCALAPPDATA%\\AgenteImpresionPOS"',
    'if not exist "%DIR%" mkdir "%DIR%"',
    'echo Descargando el agente...',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '${server}/api/print-agent/script' -OutFile (Join-Path $env:LOCALAPPDATA 'AgenteImpresionPOS\\agente.ps1')"`,
    'if errorlevel 1 goto error',
    `> "%DIR%\\config.json" echo {"server":"${server}","token":"${token}"}`,
    'echo Configurando el inicio automatico con Windows...',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=Join-Path $env:LOCALAPPDATA 'AgenteImpresionPOS'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Agente impresion POS.lnk')); $s.TargetPath='powershell.exe'; $s.Arguments=('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + [char]34 + (Join-Path $d 'agente.ps1') + [char]34); $s.WorkingDirectory=$d; $s.Save()"`,
    'echo Iniciando el agente...',
    'start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%DIR%\\agente.ps1"',
    'echo.',
    'echo LISTO. El agente quedo instalado y arranca solo cada vez que se enciende este computador.',
    'echo Vuelve al POS: en Configuracion - Impresoras el agente debe aparecer "En linea".',
    'echo Registro de actividad: %DIR%\\agente.log',
    'pause',
    'exit /b 0',
    ':error',
    'echo No se pudo descargar el agente. Revisa la conexion a internet e intenta de nuevo.',
    'pause',
    'exit /b 1',
  ];
  return lines.join('\r\n') + '\r\n';
}
