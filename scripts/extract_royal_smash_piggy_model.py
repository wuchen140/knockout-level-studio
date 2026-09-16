#!/usr/bin/env python3
"""Export the original PiggyBox_1 body and crown, with embedded base texture."""

import json
import shutil
import tempfile
from pathlib import Path

from UnityPy.helpers.MeshHelper import MeshHandler

from extract_royal_smash_platform_models import (
    OUTPUT_DIR, components_for, find_game_object, load_exporter, prefab_environment,
)

SOURCE = "449f2ea259793470bb19e52469e97518"


def main():
    exporter = load_exporter()
    environment, source = prefab_environment(exporter, SOURCE)
    positions, normals, uvs, triangles, materials, pieces = [], [], [], [], [], []
    with tempfile.TemporaryDirectory(prefix="royal-piggy-") as temporary:
        work = Path(temporary)
        (work / "textures").mkdir()
        for name in ("Mesh", "MeshCrown"):
            components = components_for(find_game_object(source, name))
            mesh = components["MeshFilter"].m_Mesh.deref_parse_as_object()
            handler = MeshHandler(mesh)
            handler.process()
            matrix = exporter.world_matrix(components["Transform"])
            normal_matrix = exporter.inverse_transpose_3x3(matrix)
            offset = len(positions)
            positions.extend(exporter.transform_position(matrix, v) for v in handler.m_Vertices)
            normals.extend(exporter.transform_normal(normal_matrix, v) for v in handler.m_Normals)
            uvs.extend((float(v[0]), float(v[1])) for v in handler.m_UV0)
            source_materials = components["MeshRenderer"].m_Materials
            submeshes = handler.get_triangles()
            for index, submesh in enumerate(submeshes):
                triangles.append([tuple(int(v) + offset for v in tri) for tri in submesh])
                material = source_materials[min(index, len(source_materials) - 1)].deref_parse_as_object()
                materials.append(exporter.extract_material(material, len(materials), work / "textures"))
            pieces.append({"node": name, "mesh": mesh.m_Name, "vertices": len(handler.m_Vertices),
                           "triangles": sum(map(len, submeshes))})
        assert len(positions) == len(normals) == len(uvs)
        assert all(material["base_texture"] for material in materials)
        # Both original renderers use PiggyBox.mat; share its texture in the GLB.
        assert len({material["unity_name"] for material in materials}) == 1
        exporter.export_glb("4127", positions, normals, uvs,
                            [[tri for submesh in triangles for tri in submesh]], materials[:1], work)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(work / "4127.glb", OUTPUT_DIR / "4127.glb")
        print(json.dumps({"source": SOURCE, "prefab": "PiggyBox_1", "pieces": pieces,
                          "bounds": [[min(v[i] for v in positions) for i in range(3)],
                                     [max(v[i] for v in positions) for i in range(3)]],
                          "output": str(OUTPUT_DIR / "4127.glb")}, indent=2))


if __name__ == "__main__":
    main()
