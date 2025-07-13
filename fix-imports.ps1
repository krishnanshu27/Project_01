# fix-imports.ps1
$projectPath = "E:\Project_01\src"

# Mapping of old filenames to new filenames (without extension)
$renameMap = @{
    "Bledata" = "BluetoothDataStream"
    "Dataplotting" = "EEGDataPlot"
    "Hrvwebglplot" = "HRVWebGLPlot"
    "MeditationSession" = "MindfulnessSession"
    "MeditationWaveform" = "BrainwaveVisualization"
    "StateIndicator" = "MentalMoodIndicator"
    "WebglPlotCanvas" = "SignalCanvasPlot"
    "fft" = "fastFourierTransform"
    "stateClassifier" = "mentalStateClassifier"
    "notchfilter" = "notchFilter"
    "eegfilter" = "bandpassFilter"
    "utils" = "helpers"
    "filters" = "signalFilterUI"
}

# File types to scan
$extensions = @("*.ts", "*.tsx", "*.js", "*.jsx")

# Go through all code files in /src
Get-ChildItem -Recurse -Path $projectPath -Include $extensions | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw
    $original = $content

    foreach ($old in $renameMap.Keys) {
        $new = $renameMap[$old]

        # Replace in import paths: './Old' or '@/components/Old'
        $content = $content -replace "(from\s+['""][^'""]*/)$old(['""])", "`$1$new`$2"
    }

    if ($content -ne $original) {
        Write-Host "Updated: $file"
        Set-Content $file $content
    }
}
