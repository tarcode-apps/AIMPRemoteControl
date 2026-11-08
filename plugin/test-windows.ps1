<#
.SYNOPSIS
    Builds and runs the unit tests (tests\) on Windows.

.DESCRIPTION
    Configures the plugin's CMake preset, builds the test programs in the same
    build folder as the plugin (out\build\<preset>, so the plugin's objects are
    compiled once for both) and runs them with CTest. The script fails when a
    test does.

.PARAMETER Arch
    Architectures to test. Defaults to both x64 and x86.

.PARAMETER Config
    Release (default) or Debug.

.PARAMETER Clean
    Delete the build directory before configuring.

.EXAMPLE
    .\test-windows.ps1 -Arch x64
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

$vsPath = Find-VisualStudio
Write-Host "Visual Studio: $vsPath"

foreach ($architecture in $Arch)
{
    $preset = "$architecture-" + $Config.ToLowerInvariant()
    $buildDir = Join-Path $PluginRoot "out\build\$preset"

    Write-Step "Testing $preset"

    Use-Toolchain -VsPath $vsPath -Architecture $architecture

    if ($Clean -and (Test-Path $buildDir))
    {
        Remove-Item -Recurse -Force $buildDir
    }

    Push-Location $PluginRoot
    try
    {
        # Set outright: a build folder configured before the option existed keeps
        # OFF in its cache whatever the default is now.
        Invoke-Native "cmake --preset $preset" cmake --preset $preset -DAIMP_BUILD_TESTS=ON
        Invoke-Native "cmake --build --preset $preset --target unit_tests" cmake --build --preset $preset --target unit_tests
        Invoke-Native "ctest" ctest --test-dir $buildDir --output-on-failure
    }
    finally
    {
        Pop-Location
    }
}

Restore-Environment

Write-Step "Done"
