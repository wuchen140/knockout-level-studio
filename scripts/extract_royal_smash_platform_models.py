#!/usr/bin/env python3
"""Extract Royal Smash platform materials and pole meshes into web-ready GLBs."""

from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


REPO_ROOT = Path(__file__).resolve().parents[1]
ROYAL_ROOT = Path("/Users/wuchen/Documents/ChatGPT/Royal Smash")
EXPORTER_PATH = ROYAL_ROOT / "outputs/royal_smash_block_models_20260827/export_block_models.py"
OUTPUT_DIR = REPO_ROOT / "public/models/royal-smash"
PREFABS = {
    "round": ("75b78589ac8cd4af8b865a0e8b979894", "Table_Round"),
    "rect": ("d2998e4c483174a2da3549a685a73a8e", "Table_Rect"),
}


def load_exporter():
    spec = importlib.util.spec_from_file_location("royal_model_exporter", EXPORTER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prefab_environment(exporter, source_name):
    paths = exporter.dependency_closure(source_name)
    environment = UnityPy.load(*(str(path) for path in paths))
    return environment, exporter.find_source_file(environment, source_name)


def components_for(game_object):
    result = {}
    for pointer in game_object.m_Components:
        if not pointer:
            continue
        reader = pointer.deref()
        result[reader.type.name] = reader.read()
    return result


def find_game_object(asset_file, name):
    for reader in asset_file.objects.values():
        if reader.type.name != "GameObject":
            continue
        game_object = reader.read()
        if game_object.m_Name == name:
            return game_object
    raise RuntimeError(f"找不到平台节点 {name}")


def extract_renderer_material(exporter, renderer, texture_dir):
    for pointer in renderer.m_Materials:
        if pointer:
            material = exporter.extract_material(pointer.deref_parse_as_object(), 0, texture_dir)
            material["double_sided"] = True
            return material
    raise RuntimeError("平台渲染器没有材质")


def export_pole_piece(exporter, asset_file, node_name, output_name, work_dir):
    components = components_for(find_game_object(asset_file, node_name))
    renderer = components["MeshRenderer"]
    mesh_filter = components["MeshFilter"]
    transform = components["Transform"]
    mesh = mesh_filter.m_Mesh.deref_parse_as_object()
    handler = MeshHandler(mesh)
    handler.process()
    matrix = exporter.world_matrix(transform)
    normal_matrix = exporter.inverse_transpose_3x3(matrix)
    positions = [exporter.transform_position(matrix, value) for value in handler.m_Vertices]
    normals = [exporter.transform_normal(normal_matrix, value) for value in handler.m_Normals]
    uvs = [(float(value[0]), float(value[1])) for value in handler.m_UV0]
    materials = [extract_renderer_material(exporter, renderer, work_dir / "textures")]
    exporter.export_glb(output_name, positions, normals, uvs, handler.get_triangles(), materials, work_dir)
    return {
        "name": output_name,
        "vertices": len(positions),
        "triangles": sum(len(values) for values in handler.get_triangles()),
        "bounds": [
            [min(value[index] for value in positions) for index in range(3)],
            [max(value[index] for value in positions) for index in range(3)],
        ],
    }


def box_geometry(width=1.0, height=0.28, depth=1.0):
    x, y, z = width / 2, height, depth / 2
    faces = [
        ((0, 1, 0), [(-x, 0, -z), (x, 0, -z), (x, 0, z), (-x, 0, z)]),
        ((0, -1, 0), [(-x, -y, z), (x, -y, z), (x, -y, -z), (-x, -y, -z)]),
        ((0, 0, 1), [(-x, -y, z), (-x, 0, z), (x, 0, z), (x, -y, z)]),
        ((0, 0, -1), [(x, -y, -z), (x, 0, -z), (-x, 0, -z), (-x, -y, -z)]),
        ((1, 0, 0), [(x, -y, z), (x, 0, z), (x, 0, -z), (x, -y, -z)]),
        ((-1, 0, 0), [(-x, -y, -z), (-x, 0, -z), (-x, 0, z), (-x, -y, z)]),
    ]
    positions, normals, uvs, triangles = [], [], [], []
    for normal, vertices in faces:
        offset = len(positions)
        positions.extend(vertices)
        normals.extend([normal] * 4)
        uvs.extend([(0, 0), (1, 0), (1, 1), (0, 1)])
        triangles.extend([(offset, offset + 1, offset + 2), (offset, offset + 2, offset + 3)])
    return positions, normals, uvs, [triangles]


def cylinder_geometry(radius=0.5, height=0.28, segments=64):
    import math

    positions, normals, uvs, triangles = [], [], [], []
    for index in range(segments + 1):
        angle = 2 * math.pi * index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        positions.extend([(radius * cosine, 0, radius * sine), (radius * cosine, -height, radius * sine)])
        normals.extend([(cosine, 0, sine), (cosine, 0, sine)])
        uvs.extend([(index / segments, 1), (index / segments, 0)])
    for index in range(segments):
        top, bottom = index * 2, index * 2 + 1
        next_top, next_bottom = top + 2, bottom + 2
        triangles.extend([(top, bottom, next_top), (next_top, bottom, next_bottom)])

    top_center = len(positions)
    positions.append((0, 0, 0))
    normals.append((0, 1, 0))
    uvs.append((0.5, 0.5))
    top_ring = len(positions)
    for index in range(segments):
        angle = 2 * math.pi * index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        positions.append((radius * cosine, 0, radius * sine))
        normals.append((0, 1, 0))
        uvs.append((0.5 + cosine * 0.5, 0.5 + sine * 0.5))
        triangles.append((top_center, top_ring + index, top_ring + (index + 1) % segments))

    bottom_center = len(positions)
    positions.append((0, -height, 0))
    normals.append((0, -1, 0))
    uvs.append((0.5, 0.5))
    bottom_ring = len(positions)
    for index in range(segments):
        angle = 2 * math.pi * index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        positions.append((radius * cosine, -height, radius * sine))
        normals.append((0, -1, 0))
        uvs.append((0.5 + cosine * 0.5, 0.5 + sine * 0.5))
        triangles.append((bottom_center, bottom_ring + (index + 1) % segments, bottom_ring + index))
    return positions, normals, uvs, [triangles]


def export_surface(exporter, asset_file, platform_shape, output_name, work_dir):
    components = components_for(find_game_object(asset_file, "Surface"))
    material = extract_renderer_material(exporter, components["MeshRenderer"], work_dir / "textures")
    geometry = cylinder_geometry() if platform_shape == "round" else box_geometry()
    exporter.export_glb(output_name, *geometry, [material], work_dir)
    return {"name": output_name, "material": material["unity_name"], "texture": material["base_texture"]["name"]}


def main():
    exporter = load_exporter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {"source": "Royal Smash game resources", "platforms": {}}
    with tempfile.TemporaryDirectory(prefix="royal-platform-") as temporary:
        work_dir = Path(temporary)
        (work_dir / "textures").mkdir()
        environments = {}
        for shape, (source_name, prefab_name) in PREFABS.items():
            environment, asset_file = prefab_environment(exporter, source_name)
            environments[shape] = environment
            surface = export_surface(exporter, asset_file, shape, f"platform-{shape}-surface", work_dir)
            metadata["platforms"][shape] = {"prefab": prefab_name, "source": source_name, "surface": surface}

        round_asset = exporter.find_source_file(environments["round"], PREFABS["round"][0])
        metadata["poleUpper"] = export_pole_piece(exporter, round_asset, "table_Pole_v01", "platform-pole-upper", work_dir)
        metadata["poleBase"] = export_pole_piece(exporter, round_asset, "table_Pole_v02", "platform-pole-base", work_dir)

        names = ["platform-rect-surface", "platform-round-surface", "platform-pole-upper", "platform-pole-base"]
        for name in names:
            shutil.copyfile(work_dir / f"{name}.glb", OUTPUT_DIR / f"{name}.glb")

    (OUTPUT_DIR / "platform-models.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"models": 4, "output": str(OUTPUT_DIR), "metadata": metadata}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
