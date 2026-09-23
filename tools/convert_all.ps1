# Convert every textured Tripo FBX in AssetForge output into assets/*.glb (skips ones already converted)
$b = 'D:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe'
$o = 'C:\Users\a.bodrov\Projects\assetforge\output'
$dst = 'E:\ClaudFiles\AceWing\assets'
$map = @{ 'aw_tank_tex'='tank|tank'; 'aw_sam_tex'='sam|truck'; 'aw_tower_tex'='tower|prop' }
foreach ($k in 'r1','r2','r3','r4','l1','l2','l3','l4','l5','l6') { $map["spb_${k}_tex"] = "spb_$k|prop" }
foreach ($e in $map.GetEnumerator()) {
  $src = Join-Path $o ("{0}_files\{0}.fbx" -f $e.Key)
  $name, $kind = $e.Value.Split('|')
  $out = Join-Path $dst "$name.glb"
  if (!(Test-Path $src)) { continue }
  if ((Test-Path $out) -and ((Get-Item $out).LastWriteTime -gt (Get-Item $src).LastWriteTime)) { continue }
  $r = & $b -b -P E:\ClaudFiles\AceWing\tools\fbx2glb.py -- $src $out $kind 2>&1 | Select-String 'AW size'
  "$name : $r"
}
