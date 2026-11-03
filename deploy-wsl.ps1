<#
.SYNOPSIS
    Builds the plugin into the AIMP installed in WSL and restarts it, from Windows.

.DESCRIPTION
    Runs deploy-linux.sh in the default WSL distribution (stop AIMP, link its
    Plugins folder at dist/linux-x64, build) and starts AIMP again through a
    hidden wsl.exe of its own, which stays open for as long as AIMP runs: WSL may
    stop a distribution once its last wsl.exe session has ended, and the player
    with it. AIMP is started again even when the build fails; the script fails
    then too.

    The player is the one in AIMP_DIR inside WSL, /opt/aimp by default.

.PARAMETER Config
    Release (default) or Debug.

.PARAMETER NoStart
    Leave AIMP stopped, for a debugger to start it.

.PARAMETER Force
    Point the links here whatever is in their place, as after moving the
    repository (see deploy-linux.sh --force).

.EXAMPLE
    .\deploy-wsl.ps1

.EXAMPLE
    .\deploy-wsl.ps1 -Config Debug -NoStart
#>
[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Config = 'Release',

    [switch]$NoStart,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'wsl.exe was not found: WSL is not installed.' }

# wsl.exe may print warnings of its own to stderr, which Windows PowerShell would
# take for a failure under 'Stop'; the exit code tells.
function Invoke-Wsl
{
    $ErrorActionPreference = 'Continue'
    & wsl.exe @args
}

# The repository as WSL sees it; forward slashes, which wslpath takes from any shell.
$repo = "$(Invoke-Wsl -e wslpath -a ($PSScriptRoot -replace '\\', '/') 2>$null)".Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw "WSL could not translate '$PSScriptRoot'." }

$flags = @('--no-start', $(if ($Config -eq 'Debug') { '--debug' } else { '--release' }))
if ($Force) { $flags += '--force' }

Invoke-Wsl -e bash -lc "cd '$repo' && ./deploy-linux.sh $($flags -join ' ')"
$deployExitCode = $LASTEXITCODE

if (-not $NoStart)
{
    Write-Host ""
    Write-Host "==> Starting AIMP in WSL" -ForegroundColor Cyan
    Start-Process -FilePath wsl.exe -ArgumentList '-e', 'bash', '-lc', '"exec \"${AIMP_DIR:-/opt/aimp}/AIMP\""' -WindowStyle Hidden
}
if ($deployExitCode -ne 0) { throw "deploy-linux.sh failed with exit code $deployExitCode." }
