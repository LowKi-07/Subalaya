"""Build a self-contained .blend of the whole house, ready to open in Blender.
Usage: python3 tools/make_blend.py house.glb textures/sky_2k.hdr out.blend
(house.glb comes from tools/export-scene.js.) Units: 1 Blender unit = 1 ft, as in the walkthrough."""
import sys, math, bpy
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from blender_common import setup, t2b
glb, hdr, out = sys.argv[1:4]
sc = setup(glb, hdr, samples=256)
sc.unit_settings.system = 'IMPERIAL'; sc.unit_settings.length_unit = 'FEET'; sc.unit_settings.scale_length = 0.3048

# group objects into collections by floor
cols = {}
def col(name):
    if name not in cols:
        c = bpy.data.collections.new(name); sc.collection.children.link(c); cols[name] = c
    return cols[name]
names = {'L0': 'Ground floor', 'L1': 'First floor', 'ROOF': 'Roof terrace', 'SITE': 'Site and street'}
for o in list(sc.collection.objects):
    if o.type not in ('MESH', 'EMPTY'): continue
    top = o
    while top.parent: top = top.parent
    key = next((k for k in names if top.name == k or top.name.startswith(k + '_')), None)
    if key is None:  # loaded models: place by height
        z = top.matrix_world.translation.z
        key = 'ROOF' if z > 19 else 'L1' if z > 9 else 'L0'
    target = col(names[key])
    for ob in [o] + list(o.children_recursive):
        for c in list(ob.users_collection): c.objects.unlink(ob)
        target.objects.link(ob)
lights = col('Lights')
for o in list(sc.collection.objects):
    if o.type == 'LIGHT':
        sc.collection.objects.unlink(o); lights.objects.link(o)

# cameras at the walkthrough's viewpoints: (name, x, eye height, z, yaw, pitch, lens mm)
cams = col('Cameras')
views = [('Street – front elevation', 5, 5.3, 84, -0.2, 0.12, 24),
         ('GF – living hall', 8.5, 5.3, 23.3, 0.35, -0.12, 18),
         ('GF – kitchen', 10.2, 5.3, 6.5, 1.2, -0.15, 18),
         ('GF – master bedroom', 22.0, 5.3, 8.5, 0.6, -0.12, 18),
         ('Flat A – living hall', 8.5, 15.3, 23.3, 0.35, -0.12, 18),
         ('Flat B – living hall', 15.5, 15.3, 44, 0.35, -0.05, 18),
         ('First floor – lobby', 7.5, 15.3, 31, 1.5, 0.0, 18),
         ('Roof terrace', 14, 25.3, 40, 0.25, 0.02, 18)]
first = None
for name, x, y, z, yaw, pitch, lens in views:
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 0.1
    co = bpy.data.objects.new(name, cd); cams.objects.link(co)
    co.location = t2b(x, y, z)
    fwd = t2b(-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
    co.rotation_euler = (-fwd).to_track_quat('Z', 'Y').to_euler()
    first = first or co
sc.camera = first

# render settings: Cycles, AgX, 1920x1080; switch Device to GPU (Metal) in Render Properties on a Mac
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.6
sc.cycles.samples = 256; sc.cycles.preview_samples = 32; sc.cycles.use_preview_denoising = True

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('saved', out, {k: len(c.all_objects) for k, c in cols.items()})
