# The Visual C++ toolchain for build-windows.ps1 and test-windows.ps1, which
# dot-source this file. It finds Visual Studio with vswhere and imports the
# developer environment of an architecture, so the scripts run unchanged on a
# developer machine (where cmake/ninja are usually only inside the Visual Studio
# installation) and on GitHub Actions windows runners (where they are already
# on PATH).

function Write-Step([string]$Message)
{
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Find-VisualStudio
{
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere))
    {
        throw "vswhere.exe not found at '$vswhere'. Install Visual Studio or the Build Tools with the C++ workload."
    }

    $installPath = & $vswhere -latest -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installPath))
    {
        throw "No Visual Studio installation with the C++ toolset was found."
    }
    return $installPath.Trim()
}

function Import-DeveloperEnvironment([string]$VsPath, [string]$Architecture)
{
    $vcvarsall = Join-Path $VsPath 'VC\Auxiliary\Build\vcvarsall.bat'
    if (-not (Test-Path $vcvarsall))
    {
        throw "vcvarsall.bat not found at '$vcvarsall'."
    }

    # Run vcvarsall in a child cmd and copy the resulting environment back here.
    # Chaining `set PATH=...;%PATH%` onto the same command line would not work:
    # cmd expands %PATH% while parsing, i.e. before vcvarsall has run.
    $output = & "$env:ComSpec" /c "`"$vcvarsall`" $Architecture >nul 2>&1 && set"
    if ($LASTEXITCODE -ne 0)
    {
        throw "vcvarsall.bat $Architecture failed. Is the $Architecture toolset installed?"
    }

    foreach ($line in $output)
    {
        if ($line -match '^([^=]+)=(.*)$')
        {
            # SetEnvironmentVariable rather than the Env: provider: names such as
            # "ProgramFiles(x86)" are not valid provider paths.
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
}

function Add-BundledBuildTools([string]$VsPath)
{
    # Visual Studio ships private copies of CMake and Ninja. On a developer
    # machine they are typically the only ones available; on CI runners PATH
    # already has them and this is a no-op.
    $bundled = @(
        (Join-Path $VsPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin'),
        (Join-Path $VsPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja')
    )
    foreach ($dir in $bundled)
    {
        if (Test-Path $dir) { $env:PATH = "$dir;$env:PATH" }
    }

    foreach ($tool in @('cmake', 'ninja'))
    {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue))
        {
            throw "'$tool' was not found on PATH and is not bundled with '$VsPath'."
        }
    }
}

function Invoke-Native([string]$Description)
{
    $executable = $args[0]
    $arguments = @()
    if ($args.Count -gt 1) { $arguments = $args[1..($args.Count - 1)] }

    Write-Host "    $Description" -ForegroundColor DarkGray
    # The tool's stderr is ordinary output: under 'Stop', Windows PowerShell would
    # otherwise take a compiler warning for a failure when the output is
    # redirected. The exit code tells.
    $ErrorActionPreference = 'Continue'
    & $executable @arguments
    if ($LASTEXITCODE -ne 0)
    {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

# Snapshot the environment so each architecture starts from a clean slate:
# importing vcvarsall twice into the same session yields a broken PATH.
$originalEnvironment = @{}
foreach ($entry in Get-ChildItem Env:) { $originalEnvironment[$entry.Name] = $entry.Value }

function Restore-Environment
{
    foreach ($entry in Get-ChildItem Env:)
    {
        if (-not $originalEnvironment.ContainsKey($entry.Name))
        {
            [Environment]::SetEnvironmentVariable($entry.Name, $null)
        }
    }
    foreach ($name in $originalEnvironment.Keys)
    {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name])
    }
}

# Imports the developer environment of `$Architecture` into a clean one.
function Use-Toolchain([string]$VsPath, [string]$Architecture)
{
    Restore-Environment
    Import-DeveloperEnvironment -VsPath $VsPath -Architecture $Architecture
    Add-BundledBuildTools -VsPath $VsPath
}
