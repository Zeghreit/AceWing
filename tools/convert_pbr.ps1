# Convert Tripo PBR downloads (basecolor + metallic/roughness/normal) into game GLBs.
# Houses are decimated for mass instancing; everything gets textures capped for the browser.
$b = 'D:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe'
$o = 'C:\Users\a.bodrov\Projects\assetforge\output'
$dst = 'E:\ClaudFiles\AceWing\assets'
function rgbSize($dir) { $f = Get-ChildItem $dir -Recurse -Include *rgb*.jpg,*basecolor*.jpg,*basecolor*.png | Select -First 1; if ($f) { $f.Length } else { -1 } }
# jobs whose target is only known by matching the basecolour with an earlier textured download
$alias = @{}
foreach ($d in Get-ChildItem $o -Directory -Filter 'house_*_pbr_files') {
  $s = rgbSize $d.FullName
  foreach ($k in 'r1','r2','r3') { if ((rgbSize (Join-Path $o "spb_${k}_tex_files")) -eq $s) { $alias[$d.Name] = "spb_$k" } }
}
foreach ($d in Get-ChildItem $o -Directory -Filter 'tank_*_pbr_files') {
  if ((rgbSize $d.FullName) -eq (rgbSize (Join-Path $o 'aw_tank_tex_files'))) { $alias[$d.Name] = 'tank' }
}
$plan = @()
foreach ($d in Get-ChildItem $o -Directory -Filter '*_pbr_files') {
  $n = $d.Name -replace '_pbr_files$',''
  if ($alias.ContainsKey($d.Name)) { $n = $alias[$d.Name] } elseif ($n -like 'house_*' -or $n -like 'tank_*') { continue }
  switch -Wildcard ($n) {
    'spb_r*'  { $plan += ,@($d, $n, 'prop', 1024, 1800) }
    'spb_l*'  { $plan += ,@($d, $n, 'prop', 2048, 0) }
    'aw_tower'{ $plan += ,@($d, 'tower', 'prop', 1024, 0) }
    'aw_sam'  { $plan += ,@($d, 'sam', 'truck', 1024, 0) }
    'tank'    { $plan += ,@($d, 'tank', 'tank', 1024, 0) }
    'carrier' { $plan += ,@($d, 'carrier', 'ship', 2048, 0) }
    'enemy'   { $plan += ,@($d, 'enemy', 'jet', 2048, 0) }
    'player'  { $plan += ,@($d, 'player', 'jet', 2048, 0) }
  }
}
foreach ($p in $plan) {
  $d, $name, $kind, $tex, $tris = $p
  $fbx = Get-ChildItem $d.FullName -Filter *.fbx | Select -First 1
  $out = Join-Path $dst "$name.glb"
  if ((Test-Path $out) -and ((Get-Item $out).LastWriteTime -gt $fbx.LastWriteTime)) { continue }
  $r = & $b -b -P E:\ClaudFiles\AceWing\tools\fbx2glb.py -- $fbx.FullName $out $kind $d.FullName $tex $tris 2>&1 | Select-String 'AW size'
  "$name : $r"
}
