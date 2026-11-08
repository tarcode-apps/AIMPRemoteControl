<#
.SYNOPSIS
    Builds the AIMP Remote Control plugin for Windows.

.DESCRIPTION
    Locates the Visual C++ toolchain with vswhere, imports the matching developer
    environment, then configures and builds the CMake preset for each requested
    architecture. Artifacts are copied to dist\windows-<arch>\.

    The script brings its own toolchain discovery (scripts\windows-toolchain.ps1),
    so it runs unchanged on a developer machine (where cmake/ninja are usually
    only inside the Visual Studio installation) and on GitHub Actions windows
    runners (where they are already on PATH).

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

$PluginRoot = $PSScriptRoot
. (Join-Path $PluginRoot 'scripts\windows-toolchain.ps1')

function Assert-EntryPointExported([string]$Dll)
{
    # AIMP resolves the entry point by its plain name. A 32-bit build that only
    # exports the decorated _AIMPPluginGetHeader@4 links fine but never loads,
    # so check the export table rather than trusting the linker.
    if (-not (Get-Command dumpbin -ErrorAction SilentlyContinue)) { return }

    # The table lists "ordinal hint RVA name"; incremental (Debug) linking adds
    # " = @ILT+NNN(name)" after the name. Nothing else may be exported.
    $names = @()
    foreach ($line in & dumpbin /nologo /exports $Dll)
    {
        if ($line -match '^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+(\S+)') { $names += $Matches[1] }
    }
    if (($names -join ', ') -ne 'AIMPPluginGetHeader')
    {
        throw "'$Dll' must export AIMPPluginGetHeader (undecorated) and nothing else; it exports: $($names -join ', ')"
    }
}

$vsPath = Find-VisualStudio
Write-Host "Visual Studio: $vsPath"

$built = @()
foreach ($architecture in $Arch)
{
    $preset = "$architecture-" + $Config.ToLowerInvariant()
    $buildDir = Join-Path $PluginRoot "out\build\$preset"
    $distDir = Join-Path $PluginRoot "dist\windows-$architecture"

    Write-Step "Building $preset"

    Use-Toolchain -VsPath $vsPath -Architecture $architecture

    if ($Clean -and (Test-Path $buildDir))
    {
        Remove-Item -Recurse -Force $buildDir
    }

    Push-Location $PluginRoot
    try
    {
        Invoke-Native "cmake --preset $preset" cmake --preset $preset
        Invoke-Native "cmake --build --preset $preset" cmake --build --preset $preset --target AIMPRemoteControlPlugin
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

    # Clear what a previous build left, but step over junctions and symlinks: a
    # developer's wwwroot link into web-client/out lives here and has to survive.
    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    try
    {
        Get-ChildItem $distDir -Force |
            Where-Object { -not $_.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) } |
            Remove-Item -Recurse -Force
    }
    catch [UnauthorizedAccessException], [IO.IOException]
    {
        throw "Cannot replace '$distDir': a running AIMP holds the plugin. Close it, or use deploy-windows.ps1. ($($_.Exception.Message))"
    }
    Copy-Item $dll $distDir
    $pdb = Join-Path $buildDir 'aimp_remote_control.pdb'
    if (Test-Path $pdb) { Copy-Item $pdb $distDir }
    Copy-Item (Join-Path $PluginRoot 'Langs') (Join-Path $distDir 'Langs') -Recurse
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
