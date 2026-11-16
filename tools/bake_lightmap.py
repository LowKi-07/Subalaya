"""Bake Cycles lighting for one level into a lightmap the walkthrough can load.
Usage: python3 tools/bake_lightmap.py scene.glb sky.hdr out_dir prefix(L0) size samples [x1 z1 x2 z2]
The optional box (walkthrough feet) limits the bake to one area; the rest of each mesh is exported as "<name>_rest".
Writes <out_dir>/<prefix>.glb (geometry with a second UV set) and <out_dir>/<prefix>_lm.jpg."""
import sys, math, time, bpy, numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from blender_common import setup
glb, hdr, out, prefix = sys.argv[1:5]
SIZE, S = int(sys.argv[5]), int(sys.argv[6])
BOX = [float(v) for v in sys.argv[7:11]] if len(sys.argv) >= 11 else None
K = 3.0  # lightmap stores lighting / K, sRGB-encoded
t0 = time.time()
sc = setup(glb, hdr, S)
targets = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(prefix + '_') and o.name.endswith('_b')]
print('targets', len(targets), 'tris', sum(len(o.data.polygons) for o in targets))
bpy.ops.object.select_all(action='DESELECT')
for o in targets: o.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
# weld the triangle soup so UV islands follow real surfaces, then rebuild hard/soft edges
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
for o in targets:
    me = o.data
    bpy.context.view_layer.objects.active = o
    if me.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=math.radians(35))
rests = []
if BOX:
    import bmesh
    x1, z1, x2, z2 = BOX
    keep = []
    for o in targets:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(o.data); n_in = 0
        for f in bm.faces:
            c = f.calc_center_median()
            f.select = x1 < c.x < x2 and z1 < -c.y < z2 and c.z < 9.9
            n_in += f.select
        total = len(bm.faces); bmesh.update_edit_mesh(o.data)
        name = o.name
        if 0 < n_in < total:
            bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
            new = next(q for q in bpy.context.selected_objects if q is not o)
            o.name = name + '_rest'; new.name = name; rests.append(o); keep.append(new)
        else:
            bpy.ops.object.mode_set(mode='OBJECT')
            if n_in: keep.append(o)
    targets = keep
    bpy.ops.object.select_all(action='DESELECT')
    for o in targets: o.select_set(True)
    print('area targets', len(targets), 'tris', sum(len(o.data.polygons) for o in targets))
for o in targets:
    lm = o.data.uv_layers.new(name='LM'); o.data.uv_layers.active = lm  # uv0 stays the render layer
print('welded', round(time.time() - t0), 's')
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=10.0 / SIZE, rotate=True)  # wide gaps so the denoiser never mixes neighbouring surfaces
bpy.ops.object.mode_set(mode='OBJECT')
print('unwrapped', round(time.time() - t0), 's')
img = bpy.data.images.new('LM', SIZE, SIZE, alpha=False, float_buffer=True)
for m in {s.material for o in targets for s in o.material_slots if s.material}:
    m.use_nodes = True
    n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
    m.node_tree.nodes.active = n
sc.render.bake.margin = 0  # padding is added after denoising instead
sc.render.bake.use_clear = True
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})
print('baked', round(time.time() - t0), 's')
px = np.empty(SIZE * SIZE * 4, dtype=np.float32); img.pixels.foreach_get(px)
rgb = np.flipud(px.reshape(SIZE, SIZE, 4)[:, :, :3])
np.save(out + '/' + prefix + '_lm_raw.npy', rgb.astype(np.float16))
# light masked blur: evens out leftover path-tracing grain without smearing black gaps into the islands
def blur(a):
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
    for ax in (0, 1):
        a = sum(np.roll(a, i - 2, axis=ax) * k[i] for i in range(5))
    return a
mask = (rgb.sum(axis=2, keepdims=True) > 0).astype(np.float32)
rgb = np.where(mask > 0, blur(rgb * mask) / np.maximum(blur(mask), 1e-4), 0)
v = np.clip(rgb / K, 0, 1)
srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
from PIL import Image
Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(out + '/' + prefix + '_lm.jpg', quality=90)
bpy.ops.object.select_all(action='DESELECT')
for o in targets + rests: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out + '/' + prefix + '.glb', export_format='GLB', use_selection=True, export_materials='NONE',
                          export_texcoords=True, export_normals=True, export_yup=True)
print('done', round(time.time() - t0), 's')
