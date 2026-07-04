param(
    [string]$DocumentPath = "docs\AscultiCor_Graduation_Book (2)_CNN_PCB_Updated.docx"
)

$ErrorActionPreference = "Stop"
$resolvedPath = (Resolve-Path -LiteralPath $DocumentPath).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null

try {
    $document = $word.Documents.Open($resolvedPath, $false, $false)
    foreach ($table in $document.TablesOfContents) {
        $table.Update()
    }
    $document.Repaginate()
    $document.Save()
}
finally {
    if ($document -ne $null) { $document.Close($true) }
    $word.Quit()
    if ($document -ne $null) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
    }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "Refreshed TOC and list fields in $resolvedPath"
