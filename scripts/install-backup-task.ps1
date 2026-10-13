param([string]$At = '03:00')
$ErrorActionPreference = 'Stop'
$AtlasRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$LogDir = Join-Path $AtlasRoot 'backups/logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Runner = Join-Path $LogDir 'run-daily.ps1'
$Content = @'
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '__ROOT__'
$LogFile = Join-Path 'backups/logs' ((Get-Date -Format 'yyyy-MM-dd-HHmmss') + '.log')
& '__NODE__' 'scripts/backup.mjs' '--daily' *> $LogFile
$Result = $LASTEXITCODE
exit $Result
'@
$Content.Replace('__ROOT__', $AtlasRoot.Replace("'", "''")).Replace('__NODE__', $NodeExe.Replace("'", "''")) | Set-Content -LiteralPath $Runner -Encoding utf8
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -File "' + $Runner + '"') -WorkingDirectory $AtlasRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At $At
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Atlas-Daily-Logical-Backup' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Atlas local Supabase logical database and private storage backup; logs failures; retain latest seven verified daily bundles.' -Force | Out-Null
Write-Output "Installed Atlas-Daily-Logical-Backup daily at $At for the current Windows user. Docker Desktop and Atlas local Supabase must be running."
