# blender -b -P fbx2glb.py -- src.fbx dst.glb kind(jet|ship|tank|truck|prop) [pbr_dir|-] [max_tex] [target_tris]
#   pbr_dir: folder of a Tripo PBR download (*metallic*, *roughness*, *normal*) - wired into the material
#   max_tex: downscale every texture to this size (keeps GLBs light enough for the browser)
#   target_tris: collapse-decimate to roughly this many triangles (for mass-instanced buildings)
import bpy, sys, math, os, glob
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]
src, dst, kind = a[0], a[1], a[2]
pbr = a[3] if len(a) > 3 and a[3] != '-' else None
max_tex = int(a[4]) if len(a) > 4 else 2048
target = int(a[5]) if len(a) > 5 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != ob: bpy.data.objects.remove(o)
vs = [v.co.copy() for v in ob.data.vertices]
mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
size = mx - mn; c = (mn + mx) / 2
L = 0 if size.x > size.y else 1
W = 1 - L
h = size.z
if kind == 'jet':
    top = [v for v in vs if v.z > mn.z + 0.8 * h]
    off = [abs(sum(v[k] for v in top) / len(top) - c[k]) / size[k] for k in (0, 1)]
    L = 0 if off[0] > off[1] else 1; W = 1 - L
    rear = sum(v[L] for v in top) / len(top) - c[L]
    front_sign = -1 if rear > 0 else 1
elif kind == 'tank':
    band = [v for v in vs if mn.z + 0.5 * h < v.z < mn.z + 0.85 * h]
    hi = max(v[L] for v in band) - c[L]; lo = c[L] - min(v[L] for v in band)
    front_sign = 1 if hi > lo else -1
elif kind == 'truck':
    def top(end): return max([v.z for v in vs if (v[L] - c[L]) * end > size[L] * 0.25] or [0])
    front_sign = 1 if top(1) < top(-1) else -1
elif kind == 'prop':
    front_sign = None
else:
    low = [v for v in vs if v.z < mn.z + 0.25 * h]
    def width(end):
        sel = [v[W] for v in low if (v[L] - c[L]) * end > size[L] * 0.38]
        return (max(sel) - min(sel)) if sel else 1e9
    front_sign = 1 if width(1) < width(-1) else -1
if front_sign is None:
    ang = 0.0
else:
    nose = Vector((0, 0, 0)); nose[L] = front_sign
    ang = math.atan2(nose.y, nose.x) - math.atan2(-1, 0)
ob.data.transform(Matrix.Translation(-c))
ob.data.transform(Matrix.Rotation(-ang, 4, 'Z'))
ob.location = (0, 0, 0)

if target:
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > target:
        m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = target / tris; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')

def find(pat):
    if not pbr: return None
    for f in glob.glob(os.path.join(pbr, '**', '*'), recursive=True):
        if pat in os.path.basename(f).lower() and f.lower().endswith(('.jpg', '.jpeg', '.png')): return f
    return None
maps = {'metal': find('metallic'), 'rough': find('roughness'), 'normal': find('normal')}
for mat in ob.data.materials:
    if not (mat and mat.use_nodes): continue
    nt = mat.node_tree; b = nt.nodes.get('Principled BSDF')
    if not b: continue
    def img(path):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path); n.image.colorspace_settings.name = 'Non-Color'
        uv = None
        for l in nt.links:  # reuse the base colour's UV mapping if any
            pass
        return n
    if maps['metal']: nt.links.new(img(maps['metal']).outputs['Color'], b.inputs['Metallic'])
    elif not b.inputs['Metallic'].is_linked: b.inputs['Metallic'].default_value = 0.35 if kind == 'jet' else 0.1
    if maps['rough']: nt.links.new(img(maps['rough']).outputs['Color'], b.inputs['Roughness'])
    elif not b.inputs['Roughness'].is_linked: b.inputs['Roughness'].default_value = 0.5 if kind == 'jet' else 0.75
    if maps['normal']:
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img(maps['normal']).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
for im in bpy.data.images:
    if im.size[0] > max_tex: im.scale(max_tex, max(1, int(im.size[1] * max_tex / im.size[0])))
print('AW size', tuple(round(s, 2) for s in size), 'lenAxis', 'XY'[L], 'front', front_sign, 'tris', sum(len(p.vertices) - 2 for p in ob.data.polygons),
      'pbr', {k: bool(v) for k, v in maps.items()})
kw = dict(filepath=dst, export_format='GLB', use_selection=False, export_apply=True)
try:
    bpy.ops.export_scene.gltf(**kw, export_image_format='JPEG', export_jpeg_quality=82)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('AW wrote', dst)
