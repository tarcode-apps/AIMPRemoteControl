<#
.SYNOPSIS
    Builds the plugin into the AIMP installed on this machine and restarts it.

.DESCRIPTION
    Closes AIMP, links the player's Plugins folder at dist\windows-<arch> and
    the plugin's wwwroot at web-client\out, builds with build-windows.ps1 and
    starts AIMP again. The links are made once and left as they are afterwards;
    something else already in their place stops the script rather than being
    removed, unless -Force.

    The player is the one in AIMP_DIR, else the one running, else the installed
    one, else C:\Program Files\AIMP. The architecture is the player's own: a
    32-bit AIMP loads only a 32-bit plugin. A portable player (UserMode=0 in its
    AIMP.ini) loads plugins from its own folder, any other from the profile.

    AIMP is started again even when the build fails; the script fails then too.
    The web client is not built here: wwwroot shows whatever web-client\out holds.

.PARAMETER Config
    Release (default) or Debug.

.PARAMETER NoStart
    Leave AIMP closed, for a debugger to start it.

.PARAMETER Force
    Point the links here whatever is in their place, as after moving the
    repository: a link elsewhere is replaced (only the link, never what it points
    at), a real folder or file is renamed to <name>.backup-<time>.

.EXAMPLE
    .\deploy-windows.ps1

.EXAMPLE
    .\deploy-windows.ps1 -Config Debug -NoStart
#>
[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Config = 'Release',

    [switch]$NoStart,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot

function Write-Step([string]$Message)
{
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Find-Player
{
    if ($env:AIMP_DIR) { return $env:AIMP_DIR }
    $running = Get-Process AIMP -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1
    if ($running) { return Split-Path $running.Path }
    # The installer leaves InstallLocation empty; its uninstaller sits in the folder.
    foreach ($key in @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\AIMP',
            'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\AIMP',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\AIMP'))
    {
        $entry = Get-ItemProperty $key -ErrorAction SilentlyContinue
        if ($entry -and $entry.DisplayIcon) { return Split-Path (($entry.DisplayIcon -split ',')[0].Trim('"')) }
    }
    return Join-Path $env:ProgramFiles 'AIMP'
}

# The machine field of the executable's PE header.
function Get-ExecutableArchitecture([string]$Exe)
{
    $stream = [IO.File]::OpenRead($Exe)
    try
    {
        $reader = New-Object IO.BinaryReader($stream)
        $stream.Position = 0x3C
        $stream.Position = $reader.ReadInt32()
        if ($reader.ReadUInt32() -ne 0x00004550) { throw "'$Exe' is not a Windows executable." }
        $machine = $reader.ReadUInt16()
    }
    finally
    {
        $stream.Dispose()
    }
    switch ($machine)
    {
        0x8664 { return 'x64' }
        0x014C { return 'x86' }
        default { throw ("'{0}' is built for machine 0x{1:X4}, which the plugin is not built for." -f $Exe, $machine) }
    }
}

function Get-PluginsFolder([string]$PlayerDir)
{
    $ini = Join-Path $PlayerDir 'AIMP.ini'
    if ((Test-Path $ini) -and (Select-String -Path $ini -Pattern '^\s*UserMode\s*=\s*0\s*$' -Quiet))
    {
        return Join-Path $PlayerDir 'Plugins'
    }
    return Join-Path $env:APPDATA 'AIMP\Plugins'
}

# Through the player's own command line: the running copy takes -EXIT over from
# the second one and quits as from its menu, playlists saved, whether or not it
# has a window on screen. A modal dialog of its own keeps it from quitting.
function Close-Player([string]$Exe)
{
    if (-not (Get-Process AIMP -ErrorAction SilentlyContinue)) { return }
    Start-Process -FilePath $Exe -ArgumentList '-EXIT' -WorkingDirectory (Split-Path $Exe) -Wait
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Process AIMP -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline)
    {
        Start-Sleep -Milliseconds 250
    }
    if (Get-Process AIMP -ErrorAction SilentlyContinue)
    {
        throw 'AIMP did not quit. A dialog of its own may be open: close it and run again.'
    }
}

function Get-LinkTarget($Item)
{
    $target = @($Item.Target)[0]
    if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $Item.FullName) $target }
    return [IO.Path]::GetFullPath($target).TrimEnd('\')
}

# A junction needs its target to exist, so the target is made first: an empty
# web-client\out before the client's first build, say.
function Set-Link([string]$Path, [string]$Target)
{
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($item)
    {
        if ($item.LinkType -and (Get-LinkTarget $item) -ieq $Target.TrimEnd('\')) { return }
        if (-not $Force)
        {
            throw "'$Path' is already there and is not a link to '$Target'. Move it away, or run again with -Force."
        }
        if ($item.LinkType)
        {
            # The link alone; Remove-Item could walk into what it points at.
            if ($item.PSIsContainer) { [IO.Directory]::Delete($item.FullName, $false) }
            else { [IO.File]::Delete($item.FullName) }
        }
        else
        {
            $backup = "$($item.Name).backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Rename-Item -LiteralPath $item.FullName -NewName $backup
            Write-Host "    $Path moved aside as $backup"
        }
    }
    New-Item -ItemType Directory -Force -Path $Target, (Split-Path $Path) | Out-Null
    New-Item -ItemType Junction -Path $Path -Target $Target | Out-Null
    Write-Host "    $Path -> $Target"
}

$playerDir = Find-Player
$playerExe = Join-Path $playerDir 'AIMP.exe'
if (-not (Test-Path $playerExe)) { throw "AIMP.exe is not in '$playerDir'; set AIMP_DIR to the player's folder." }
$architecture = Get-ExecutableArchitecture $playerExe
$pluginsDir = Get-PluginsFolder $playerDir
$distDir = Join-Path $RepoRoot "dist\windows-$architecture"
Write-Host "AIMP: $playerExe ($architecture), plugins in $pluginsDir"

Write-Step 'Closing AIMP'
Close-Player $playerExe

Write-Step 'Linking'
Set-Link (Join-Path $pluginsDir 'aimp_remote_control') $distDir
Set-Link (Join-Path $distDir 'wwwroot') (Join-Path $RepoRoot 'web-client\out')

# A child process, so that the build's developer environment stays there. Its
# stderr is ordinary output: under 'Stop', Windows PowerShell would otherwise
# take a compiler warning for a failure when the output is redirected.
& {
    $ErrorActionPreference = 'Continue'
    & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'build-windows.ps1') -Arch $architecture -Config $Config
}
$buildExitCode = $LASTEXITCODE

if (-not $NoStart)
{
    Write-Step 'Starting AIMP'
    Start-Process -FilePath $playerExe -WorkingDirectory $playerDir
}
if ($buildExitCode -ne 0) { throw "The build failed with exit code $buildExitCode." }
