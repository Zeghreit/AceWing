# Ace Wing

Arcade three.js remake of the 8-bit carrier dogfighter.

**Run locally:** double-click `play.bat` (starts `py serve.py` on http://localhost:8777 and opens the browser).

- `main.js` — game loop, flight model, AI, missions, HUD data
- `clouds.js` — volumetric ray-marched cloud layer (half-res) + FX compositing
- `fx.js` — Gerstner ocean, particles, trails, tracers, screen post effect
- `models.js` — procedural fallback meshes (used when a GLB is missing)
- `assets/*.glb` — AssetForge models (Gemini concept → Tripo Smart Mesh P2 → texture → Blender)
- `tools/fbx2glb.py` — Blender script: Tripo FBX → oriented, centred GLB (`blender -b -P tools/fbx2glb.py -- in.fbx out.glb jet|ship`)
