$ml = Get-Content 'src/ml_data.json' | ConvertFrom-Json
$csv = Import-Csv 'Pokemon.csv'

foreach ($c in 0..5) {
    $names = ($ml.pca | Where-Object { $_.cluster -eq $c }).name
    $matched = $csv | Where-Object { $names -contains $_.Name }
    $hp = ($matched | ForEach-Object { [int]$_.HP } | Measure-Object -Average).Average
    $atk = ($matched | ForEach-Object { [int]$_.Attack } | Measure-Object -Average).Average
    $def = ($matched | ForEach-Object { [int]$_.Defense } | Measure-Object -Average).Average
    $spa = ($matched | ForEach-Object { [int]$_.'Sp. Atk' } | Measure-Object -Average).Average
    $spd = ($matched | ForEach-Object { [int]$_.'Sp. Def' } | Measure-Object -Average).Average
    $spe = ($matched | ForEach-Object { [int]$_.Speed } | Measure-Object -Average).Average
    $count = $matched.Count
    Write-Host "Cluster ${c}: count=${count}, HP=$([math]::Round($hp)), Atk=$([math]::Round($atk)), Def=$([math]::Round($def)), SpA=$([math]::Round($spa)), SpD=$([math]::Round($spd)), Spd=$([math]::Round($spe))"
}
