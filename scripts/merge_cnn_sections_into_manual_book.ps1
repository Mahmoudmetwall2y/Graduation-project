param(
    [string]$Destination = "docs\AscultiCor_Graduation_Book (2)_CNN_Updated.docx",
    [string]$Donor = "docs\AscultiCor_Graduation_Book_Template_Filled.docx"
)

$ErrorActionPreference = "Stop"
$destinationPath = (Resolve-Path -LiteralPath $Destination).Path
$donorPath = (Resolve-Path -LiteralPath $Donor).Path

function Find-HeadingRange($document, [string]$text) {
    foreach ($paragraph in $document.Paragraphs) {
        $paragraphText = $paragraph.Range.Text.Trim("`r", "`a", " ", "`t")
        $styleName = [string]$paragraph.Range.Style.NameLocal
        if ($paragraphText -eq $text -and $styleName -like "Heading*") {
            return $paragraph.Range
        }
    }
    throw "Could not find heading '$text' in $($document.Name)"
}

function Copy-SectionRange(
    $sourceDocument,
    $destinationDocument,
    [string]$sourceStartText,
    [string]$sourceEndText,
    [string]$destinationStartText,
    [string]$destinationEndText
) {
    $sourceStart = Find-HeadingRange $sourceDocument $sourceStartText
    $sourceEnd = Find-HeadingRange $sourceDocument $sourceEndText
    $destinationStart = Find-HeadingRange $destinationDocument $destinationStartText
    $destinationEnd = Find-HeadingRange $destinationDocument $destinationEndText

    $sourceRange = $sourceDocument.Range(
        $sourceStart.Paragraphs.Item(1).Range.Start,
        $sourceEnd.Paragraphs.Item(1).Range.Start
    )
    $destinationRange = $destinationDocument.Range(
        $destinationStart.Paragraphs.Item(1).Range.Start,
        $destinationEnd.Paragraphs.Item(1).Range.Start
    )
    $destinationRange.FormattedText = $sourceRange.FormattedText
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$destinationDocument = $null
$donorDocument = $null

try {
    $destinationDocument = $word.Documents.Open($destinationPath, $false, $false)
    $donorDocument = $word.Documents.Open($donorPath, $false, $true)

    Copy-SectionRange `
        $donorDocument $destinationDocument `
        "Model 3: PyTorch CNN Murmur Characterization" `
        "Training, Validation, and Class-Imbalance Handling" `
        "Model 3: Pending Murmur-Severity Slot" `
        "Training, Validation, and Class-Imbalance Handling"

    Copy-SectionRange `
        $donorDocument $destinationDocument `
        "Murmur-Characterization CNN Results" `
        "Model Comparison, Error Analysis, and Reproducibility" `
        "Murmur-Severity CNN Status" `
        "Model Comparison, Error Analysis, and Reproducibility"

    # Do not rebuild the user's manually formatted TOC/list fields here.
    $destinationDocument.Repaginate()
    $destinationDocument.Save()
}
finally {
    if ($donorDocument -ne $null) { $donorDocument.Close($false) }
    if ($destinationDocument -ne $null) { $destinationDocument.Close($true) }
    $word.Quit()
    if ($donorDocument -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($donorDocument) | Out-Null }
    if ($destinationDocument -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($destinationDocument) | Out-Null }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "Merged CNN sections into $destinationPath"
