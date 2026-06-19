# Run GitHub CLI even when not on PATH (fresh Windows install).
$GhCandidates = @(
    "$env:ProgramFiles\GitHub CLI\gh.exe",
    "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe",
    "${env:ProgramFiles(x86)}\GitHub CLI\gh.exe"
)

$Gh = $null
foreach ($candidate in $GhCandidates) {
    if (Test-Path $candidate) {
        $Gh = $candidate
        break
    }
}

if (-not $Gh) {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd) { $Gh = $cmd.Source }
}

if (-not $Gh) {
    Write-Error "GitHub CLI not found. Install from https://cli.github.com/"
    exit 1
}

& $Gh @args
exit $LASTEXITCODE
