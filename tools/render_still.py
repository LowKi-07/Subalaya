"""Render a photoreal still. Usage: python3 tools/render_still.py scene.glb sky.hdr out.png x y z yaw pitch [w h samples]
Camera uses the walkthrough's own coordinates (feet, eye position, yaw/pitch in radians)."""
import sys, math, bpy
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from blender_common import setup, t2b
glb, hdr, out = sys.argv[1:4]
x, y, z, yaw, pitch = map(float, sys.argv[4:9])
W, H, S = (int(v) for v in (sys.argv[9:12] + ['1280', '800', '96'])[:3])
sc = setup(glb, hdr, S)
cam = bpy.data.cameras.new('Cam'); cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(62)
co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = t2b(x, y, z)
fwd = t2b(-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
co.rotation_euler = (-fwd).to_track_quat('Z', 'Y').to_euler()
cam.clip_start = 0.1
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.6
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
