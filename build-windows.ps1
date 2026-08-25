<#
.SYNOPSIS
    Builds the AIMP Remote Control plugin for Windows.

.DESCRIPTION
    Locates the Visual C++ toolchain with vswhere, imports the matching developer
    environment, then configures and builds the CMake preset for each requested
    architecture. Artifacts are copied to dist\windows-<arch>\.

    The script brings its own toolchain discovery, so it runs unchanged on a
    developer machine (where cmake/ninja are usually only inside the Visual
    Studio installation) and on GitHub Actions windows runners (where they are
    already on PATH).

.PARAMETER Arch
    Architectures to build. Defaults to both x64 and x86.

.PARAMETER Config
    Release (default) or Debug.

.PARAMETER Clean
    Delete the build directory before configuring.

.EXAMPLE
    .\build-windows.ps1
    Builds Release for x64 and x86.

.EXAMPLE
    .\build-windows.ps1 -Arch x64 -Config Debug -Clean
#>
[CmdletBinding()]
param(
    [ValidateSet('x64', 'x86')]
    [string[]]$Arch = @('x64', 'x86'),

    [ValidateSet('Release', 'Debug')]
    [string]$Config = 'Release',

    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot

function Write-Step([string]$Message)
{
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Submodules
{
    # Header-only dependencies live in submodules; an incomplete checkout fails
    # much later with a confusing "cannot open include file".
    $probes = @(
        'third_party\json\include\nlohmann\json.hpp',
        'third_party\json-rpc-cxx\include\cxx\jsonrpc\server.hpp',
        'third_party\cpp-httplib\httplib.h',
        'third_party\asio\include\asio.hpp'
    )
    foreach ($probe in $probes)
    {
        if (-not (Test-Path (Join-Path $RepoRoot $probe)))
        {
            throw "Missing dependency '$probe'. Run: git submodule update --init --recursive"
        }
    }
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

function Assert-EntryPointExported([string]$Dll)
{
    # AIMP resolves the entry point by its plain name. A 32-bit build that only
    # exports the decorated _AIMPPluginGetHeader@4 links fine but never loads,
    # so check the export table rather than trusting the linker.
    if (-not (Get-Command dumpbin -ErrorAction SilentlyContinue)) { return }

    # Incremental (Debug) linking prints the export as
    # "AIMPPluginGetHeader = @ILT+NNN(AIMPPluginGetHeader)"; the leading \s
    # still rejects the decorated _AIMPPluginGetHeader@4.
    $exports = & dumpbin /nologo /exports $Dll
    foreach ($line in $exports)
    {
        if ($line -match '\sAIMPPluginGetHeader(\s*=.*)?\s*$') { return }
    }
    throw "AIMPPluginGetHeader is not exported (undecorated) from '$Dll'."
}

function Invoke-Native([string]$Description)
{
    $executable = $args[0]
    $arguments = @()
    if ($args.Count -gt 1) { $arguments = $args[1..($args.Count - 1)] }

    Write-Host "    $Description" -ForegroundColor DarkGray
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

Assert-Submodules
$vsPath = Find-VisualStudio
Write-Host "Visual Studio: $vsPath"

$built = @()
foreach ($architecture in $Arch)
{
    $preset = "$architecture-" + $Config.ToLowerInvariant()
    $buildDir = Join-Path $RepoRoot "out\build\$preset"
    $distDir = Join-Path $RepoRoot "dist\windows-$architecture"

    Write-Step "Building $preset"

    Restore-Environment
    Import-DeveloperEnvironment -VsPath $vsPath -Architecture $architecture
    Add-BundledBuildTools -VsPath $vsPath

    if ($Clean -and (Test-Path $buildDir))
    {
        Remove-Item -Recurse -Force $buildDir
    }

    Push-Location $RepoRoot
    try
    {
        Invoke-Native "cmake --preset $preset" cmake --preset $preset
        Invoke-Native "cmake --build --preset $preset" cmake --build --preset $preset
    }
    finally
    {
        Pop-Location
    }

    $dll = Join-Path $buildDir 'aimp_remote_control.dll'
    if (-not (Test-Path $dll))
    {
        throw "Build finished but '$dll' is missing."
    }
    Assert-EntryPointExported -Dll $dll

    if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    Copy-Item $dll $distDir
    $pdb = Join-Path $buildDir 'aimp_remote_control.pdb'
    if (Test-Path $pdb) { Copy-Item $pdb $distDir }
    Copy-Item (Join-Path $RepoRoot 'Langs') (Join-Path $distDir 'Langs') -Recurse
    Copy-Item (Join-Path $RepoRoot 'wwwroot') (Join-Path $distDir 'wwwroot') -Recurse
    Copy-Item (Join-Path $buildDir 'THIRD-PARTY-NOTICES.txt') $distDir

    $built += (Join-Path $distDir 'aimp_remote_control.dll')
}

Restore-Environment

Write-Step "Done"
foreach ($artifact in $built)
{
    $size = [math]::Round((Get-Item $artifact).Length / 1KB)
    Write-Host "    $artifact ($size KB)"
}
