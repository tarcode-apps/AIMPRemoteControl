<#
.SYNOPSIS
    Builds and runs the unit tests (tests\) on Windows.

.DESCRIPTION
    Configures the plugin's CMake preset with the unit tests turned on, in a
    build folder of its own (out\build\<preset>-tests), so the plugin build in
    out\build\<preset> stays as build-windows.ps1 leaves it. Builds the test
    programs and runs them with CTest; the script fails when a test does.

.PARAMETER Arch
    Architectures to test. Defaults to both x64 and x86.

.PARAMETER Config
    Release (default) or Debug.

.PARAMETER Clean
    Delete the test build directory before configuring.

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

$RepoRoot = $PSScriptRoot
. (Join-Path $RepoRoot 'scripts\windows-toolchain.ps1')

$vsPath = Find-VisualStudio
Write-Host "Visual Studio: $vsPath"

foreach ($architecture in $Arch)
{
    $preset = "$architecture-" + $Config.ToLowerInvariant()
    $testDir = Join-Path $RepoRoot "out\build\$preset-tests"

    Write-Step "Testing $preset"

    Use-Toolchain -VsPath $vsPath -Architecture $architecture

    if ($Clean -and (Test-Path $testDir))
    {
        Remove-Item -Recurse -Force $testDir
    }

    Push-Location $RepoRoot
    try
    {
        Invoke-Native "cmake --preset $preset (tests)" cmake --preset $preset -B $testDir -DAIMP_BUILD_TESTS=ON
        Invoke-Native "cmake --build (tests)" cmake --build $testDir --target unit_tests
        Invoke-Native "ctest" ctest --test-dir $testDir --output-on-failure
    }
    finally
    {
        Pop-Location
    }
}

Restore-Environment

Write-Step "Done"
