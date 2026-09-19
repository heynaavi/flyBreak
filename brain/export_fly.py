"""Export the flybody (DeepMind + Janelia, Apache-2.0) rest pose for the Three.js fly.

    python export_fly.py <path/to/fruitfly.xml> <out_dir>

Writes <out_dir>/scene.json: every visual mesh geom with its world position + rotation at the
default pose, which body it belongs to, its colour, plus the wing hinge joints and the body
positions we articulate (wings, proboscis, head). Mesh files are converted separately with gltfpack.
"""
import json
import re
import sys
from pathlib import Path

import mujoco
import numpy as np

xml_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
m = mujoco.MjModel.from_xml_path(str(xml_path))
d = mujoco.MjData(m)
mujoco.mj_forward(m, d)

# mesh name -> file (the asset table keeps names; files come from the xml)
files = {}
for mm in re.finditer(r'<mesh\s+([^>]*)/?>', xml_path.read_text()):
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', mm.group(1)))
    if 'file' in attrs:
        files[attrs.get('name', Path(attrs['file']).stem)] = attrs['file']

name = lambda kind, i: mujoco.mj_id2name(m, kind, i)
geoms = []
for g in range(m.ngeom):
    if m.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH:
        continue
    mesh = name(mujoco.mjtObj.mjOBJ_MESH, m.geom_dataid[g])
    mat = m.geom_matid[g]
    rgba = (m.mat_rgba[mat] if mat >= 0 else m.geom_rgba[g]).tolist()
    geoms.append({
        'mesh': mesh, 'file': files.get(mesh, mesh + '.obj'),
        'body': name(mujoco.mjtObj.mjOBJ_BODY, m.geom_bodyid[g]),
        'pos': d.geom_xpos[g].tolist(), 'mat': d.geom_xmat[g].tolist(),
        'rgba': rgba, 'group': int(m.geom_group[g]),
        'scale': m.mesh_scale[m.geom_dataid[g]].tolist() if hasattr(m, 'mesh_scale') else [1, 1, 1],
        'mesh_pos': m.mesh_pos[m.geom_dataid[g]].tolist(), 'mesh_quat': m.mesh_quat[m.geom_dataid[g]].tolist(),
    })

bodies = {}
for b in range(m.nbody):
    bodies[name(mujoco.mjtObj.mjOBJ_BODY, b)] = {
        'pos': d.xpos[b].tolist(), 'mat': d.xmat[b].tolist(),
        'parent': name(mujoco.mjtObj.mjOBJ_BODY, m.body_parentid[b]),
    }
joints = {}
for j in range(m.njnt):
    joints[name(mujoco.mjtObj.mjOBJ_JOINT, j)] = {
        'body': name(mujoco.mjtObj.mjOBJ_BODY, m.jnt_bodyid[j]),
        'anchor': d.xanchor[j].tolist(), 'axis': d.xaxis[j].tolist(), 'type': int(m.jnt_type[j]),
    }
allpos = np.array([g['pos'] for g in geoms])
scene = {'geoms': geoms, 'bodies': bodies, 'joints': joints,
         'bbox': [allpos.min(0).tolist(), allpos.max(0).tolist()]}
(out_dir / 'scene.json').write_text(json.dumps(scene))
print(f"{len(geoms)} mesh geoms, {len(bodies)} bodies, {len(joints)} joints -> {out_dir/'scene.json'}")
print('bodies with "wing":', [b for b in bodies if 'wing' in b])
print('joints with "wing":', [j for j in joints if 'wing' in j])
print('proboscis-ish bodies:', [b for b in bodies if any(k in b for k in ('rostrum', 'haustellum', 'labrum', 'head'))])
