"""Denoise a baked lightmap with Intel Open Image Denoise's lightmap filter and write the JPEG.
Usage: LD_LIBRARY_PATH=<bpy>/lib python3 tools/denoise_lightmap.py L0_lm_raw.npy L0_lm.jpg"""
import sys, numpy as np, oidn
from PIL import Image
K = 3.0
rgb = np.load(sys.argv[1]).astype(np.float32)
H, W, _ = rgb.shape
# grow each UV island outwards so the denoiser and texture filtering never pull in black gaps
mask = rgb.sum(axis=2) > 0
# pad every island outwards so texture filtering and the denoiser never reach the black gaps
def shift_all(m):
    return [np.roll(m, d, axis=(0, 1)) for d in ((0, 1), (0, -1), (1, 0), (-1, 0))]
def grow_from(valid, allowed, steps):
    for _ in range(steps):
        acc = np.zeros_like(rgb); cnt = np.zeros((H, W), np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(rgb * valid[..., None], (dy, dx), axis=(0, 1)); cnt += np.roll(valid, (dy, dx), axis=(0, 1))
        new = allowed & (~valid) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]; valid = valid | new
    return valid
grow_from(mask.copy(), np.ones_like(mask), 7)
src = np.ascontiguousarray(rgb); dst = np.zeros_like(src)
dev = oidn.NewDevice(); oidn.CommitDevice(dev)
f = oidn.NewFilter(dev, 'RTLightmap')
oidn.SetSharedFilterImage(f, 'color', src, oidn.FORMAT_FLOAT3, W, H)
oidn.SetSharedFilterImage(f, 'output', dst, oidn.FORMAT_FLOAT3, W, H)
oidn.CommitFilter(f); oidn.ExecuteFilter(f)
err = oidn.GetDeviceError(dev)
if err and err[0] != oidn.ERROR_NONE: raise SystemExit(str(err))
v = np.clip(dst / K, 0, 1)
srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(sys.argv[2], quality=92)
print('denoised', W, H)
