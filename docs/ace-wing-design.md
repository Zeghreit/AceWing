# Ace Wing — 8-bit carrier dogfighter remake (three.js)

Status (2026-09-23): playable, 6 sorties with level select (ocean ×3, Sierra Pass mountains, White Nights — St Petersburg city, Red Horizon).
- Web / iPhone: https://zeghreit.github.io/AceWing/ (GitHub Pages from github.com/Zeghreit/AceWing, branch main, root). Deploy = commit + `git push` from E:\ClaudFiles\AceWing (Git Credential Manager is set up on the PC). Versioning like Kubik: numbers for features, letters for fixes.
- Local: E:\ClaudFiles\AceWing, desktop shortcut "Ace Wing" (launch.vbs starts serve.py hidden + opens http://localhost:8777). `#demo` = silent test mode, `?touch` = force the phone UI on desktop.
- Artifact (older mirror, base64 GLB modules): https://claude.ai/artifact/NMCVzzHJtFUB6qgahJRQiv (v11).

## Mobile (iPhone) build
- PWA meta + manifest + apple-touch-icon → Add to Home Screen runs full screen, landscape; rotate hint in portrait.
- Controls: floating stick under the left thumb (dead zone + curve), right cluster GUN / MSL / FLR / THR+ / THR− / GEAR, CAM and pause on top; HUD moves radar to top-right and weapons to bottom-centre on touch.
- Lighter settings on touch: ~0.95 Mpx render budget + adaptive resolution, clouds 56 steps at 0.4 scale, 1024 shadow map, house LOD radius 550 m. City models (16 GLBs) load only when a city sortie is chosen.

## AssetForge pipeline used
- Gemini concept (3/4 view, white bg) → Tripo image_to_3d Smart Mesh P2 (6000 for houses) → tripo_texture 2k → tripo_pbr (metallic/roughness/normal) → FBX.
- Blender headless `tools/fbx2glb.py src dst kind [pbr_dir] [max_tex] [target_tris]` wires PBR maps, downsizes textures, decimates houses to ~1.8k tris. `tools/convert_pbr.ps1` batch-converts every *_pbr_files folder.
- 22 PBR GLBs: player, enemy, carrier, tank, SAM truck, radio tower, 10 Petersburg houses (spb_r1-10), 6 landmarks (spb_l1-6). Icon: acewing.ico/png (Gemini).

## City generator (terrain.js makeCity)
- Districts with their own street geometry: Admiralty "trident" polar fan, two skewed grids, Vasilievsky-style "lines", radial knot at the fortress; Neva + three canals.
- Perimeter blocks of 3–12 floor houses + courtyard wings, turrets/churches, yards, parks, lamps. LOD: near lots get the best-fitting house model, far lots procedural boxes.

## Findings / issues (AssetForge improvements)
- Tripo page / AssetForge Chrome crash several times per long queue; server restart lost the job registry.
- With a serial queue a failed image_to_3d makes the following texture/pbr run on the wrong open asset → verify each generation first, or let texture/pbr take an asset id.
- tripo_pbr sometimes downloads before maps exist or "Export dialog did not open" → rerun open_asset + pbr.
- Earlier: Generate not clicked; "Texture Resolution buttons not found"; fmt='glb' writes FBX; queue strictly serial.

## Tech
- Volumetric clouds with temporal reprojection, Gerstner ocean (calm in the city), bloom, FXAA, adaptive resolution. Box-filtered emissive windows. Quiet HUD.
- Debug: `window.__acewing` (goto(i), launch(), cam(pos,target,fov), grounds, glbs, touch).
