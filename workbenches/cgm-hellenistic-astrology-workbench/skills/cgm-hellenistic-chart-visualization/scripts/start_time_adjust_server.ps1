param([string]$ProjectRoot = (Get-Location).Path)
$projectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$runtime = Join-Path $projectRoot '.cgm-hellenistic-astrology\runtime\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $runtime)) {
    $runtime = (Get-Command python -ErrorAction SilentlyContinue).Source
}
$server = Join-Path $PSScriptRoot 'time_adjust_server.py'
if (-not $runtime) {
    throw '找不到 Python。请先安装排盘运行环境。'
}
$env:CGM_CHART_PROJECT_ROOT = $projectRoot
function Test-LocalChartPort([int]$port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try { $client.Connect('127.0.0.1', $port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}
if (-not (Test-LocalChartPort 4852)) {
    Start-Process -FilePath $runtime -ArgumentList ('"' + $server + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden
}
$env:CGM_CHART_SERVER_PORT = '4853'
if (-not (Test-LocalChartPort 4853)) {
    Start-Process -FilePath $runtime -ArgumentList ('"' + $server + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden
}
Remove-Item Env:CGM_CHART_SERVER_PORT
