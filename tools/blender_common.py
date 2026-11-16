"""Shared Blender setup: import the exported scene, add sun + sky. Units: 1 = 1 ft (as in the walkthrough)."""
import bpy, math, os
from mathutils import Vector

def t2b(x, y, z):  # three.js (Y up) -> Blender (Z up)
    return Vector((x, -z, y))

def setup(glb, hdr, samples=64, lamp_watts=260):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.threads_mode = 'AUTO'
    # sun, matching the walkthrough's directional light
    sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(1.5); sun.color = (1.0, 0.94, 0.86)
    so = bpy.data.objects.new('Sun', sun); sc.collection.objects.link(so)
    d = t2b(-50, 75, 60).normalized()  # direction from the house toward the sun
    so.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    # sky from the same HDR photo the walkthrough uses
    w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdr)
    nt.links.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 2.5
    # window glass: let light straight through (no shadow), like real clear glazing
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and bsdf.inputs['Alpha'].default_value < 0.5 and not bsdf.inputs['Alpha'].is_linked:
            bsdf.inputs['Alpha'].default_value = 0.06
    # The walkthrough's ceiling lights are small glowing discs. Tiny emitters path-trace very noisily,
    # so each disc gets a soft area light just below it and the disc itself only glows faintly.
    for m in list(bpy.data.materials):
        if not m.use_nodes: continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        e = bsdf.inputs['Emission Strength'].default_value
        if e <= 0 or max(bsdf.inputs['Emission Color'].default_value[:3]) <= 0: continue
        if abs(e - 0.35) > 0.02:            # lamp shades, facade lights: gentle glow
            bsdf.inputs['Emission Strength'].default_value = e * 30; continue
        bsdf.inputs['Emission Strength'].default_value = 3.0
        for o in [o for o in bpy.data.objects if o.type == 'MESH' and any(sl.material == m for sl in o.material_slots)]:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.remove_doubles(threshold=0.001); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
            for part in list(bpy.context.selected_objects):
                pts = [part.matrix_world @ Vector(c) for c in part.bound_box]
                lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
                hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
                w = max(hi.x - lo.x, hi.y - lo.y)
                if w > 3: continue  # under-cabinet strips etc.
                L = bpy.data.lights.new('Ceil', 'AREA'); L.shape = 'DISK'; L.size = 2.6; L.color = (1.0, 0.9, 0.78)
                L.energy = lamp_watts * (w / 1.2) ** 2
                lo_ = bpy.data.objects.new('Ceil', L); sc.collection.objects.link(lo_)
                lo_.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z - 0.12)  # faces down by default
    return sc
