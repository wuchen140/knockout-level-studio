#!/usr/bin/env python3
"""Convert AssetRipper Unity YAML mesh assets to GLB 2.0 without changing source scale."""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
from pathlib import Path


FORMAT_INFO = {
    0: ("f", 4, lambda value: value),
    1: ("e", 2, lambda value: value),
    2: ("B", 1, lambda value: value / 255.0),
    3: ("b", 1, lambda value: max(value / 127.0, -1.0)),
    4: ("H", 2, lambda value: value / 65535.0),
    5: ("h", 2, lambda value: max(value / 32767.0, -1.0)),
    6: ("B", 1, lambda value: value),
    7: ("b", 1, lambda value: value),
    8: ("H", 2, lambda value: value),
    9: ("h", 2, lambda value: value),
    10: ("I", 4, lambda value: value),
    11: ("i", 4, lambda value: value),
}


def field_int(text: str, name: str, default: int | None = None) -> int:
    match = re.search(rf"^\s*{re.escape(name)}:\s*(-?\d+)\s*$", text, re.MULTILINE)
    if match:
        return int(match.group(1))
    if default is not None:
        return default
    raise ValueError(f"Missing {name}")


def parse_mesh(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    name = re.search(r"^\s*m_Name:\s*(.+)$", text, re.MULTILINE).group(1).strip()
    index_format = field_int(text, "m_IndexFormat", 0)
    index_hex = re.search(r"^\s*m_IndexBuffer:\s*([0-9a-fA-F]+)\s*$", text, re.MULTILINE)
    vertex_section = re.search(r"^\s*m_VertexData:\s*$([\s\S]*?)^\s*m_CompressedMesh:\s*$", text, re.MULTILINE)
    submesh_section = re.search(r"^\s*m_SubMeshes:\s*$([\s\S]*?)^\s*m_Shapes:\s*$", text, re.MULTILINE)
    if not index_hex or not vertex_section or not submesh_section:
        raise ValueError(f"Unsupported or compressed mesh layout: {path}")

    vertex_text = vertex_section.group(1)
    vertex_count = field_int(vertex_text, "m_VertexCount")
    data_size = field_int(vertex_text, "m_DataSize")
    vertex_hex = re.search(r"^\s*_typelessdata:\s*([0-9a-fA-F]+)\s*$", vertex_text, re.MULTILINE)
    if not vertex_hex:
        raise ValueError(f"Missing vertex buffer: {path}")
    vertex_bytes = bytes.fromhex(vertex_hex.group(1))
    if len(vertex_bytes) != data_size:
        raise ValueError(f"Vertex buffer size mismatch in {path}: {len(vertex_bytes)} != {data_size}")

    channels = []
    channel_pattern = re.compile(
        r"- stream:\s*(\d+)\s*\n\s*offset:\s*(\d+)\s*\n\s*format:\s*(\d+)\s*\n\s*dimension:\s*(\d+)"
    )
    for stream, offset, data_format, dimension in channel_pattern.findall(vertex_text):
        channels.append({
            "stream": int(stream),
            "offset": int(offset),
            "format": int(data_format),
            "dimension": int(dimension),
        })
    if len(channels) < 5 or channels[0]["dimension"] != 3:
        raise ValueError(f"Required vertex channels are missing in {path}")
    active_streams = {channel["stream"] for channel in channels if channel["dimension"]}
    if active_streams != {0}:
        raise ValueError(f"Multiple vertex streams are not supported in {path}: {active_streams}")
    stride = data_size // vertex_count
    if stride * vertex_count != data_size:
        raise ValueError(f"Invalid vertex stride in {path}")

    def decode_channel(channel_index: int, expected_dimension: int) -> list[tuple[float, ...]] | None:
        channel = channels[channel_index]
        if channel["dimension"] != expected_dimension:
            return None
        fmt, component_size, convert = FORMAT_INFO[channel["format"]]
        unpack = struct.Struct("<" + fmt * expected_dimension)
        if channel["offset"] + component_size * expected_dimension > stride:
            raise ValueError(f"Channel exceeds vertex stride in {path}")
        return [
            tuple(float(convert(value)) for value in unpack.unpack_from(vertex_bytes, i * stride + channel["offset"]))
            for i in range(vertex_count)
        ]

    positions = decode_channel(0, 3)
    normals = decode_channel(1, 3)
    uvs = decode_channel(4, 2)
    if positions is None:
        raise ValueError(f"Position channel is invalid in {path}")

    mins = [min(vertex[axis] for vertex in positions) for axis in range(3)]
    maxs = [max(vertex[axis] for vertex in positions) for axis in range(3)]
    if normals:
        normalized_normals = []
        for normal in normals:
            length = math.sqrt(sum(value * value for value in normal)) or 1.0
            normalized_normals.append(tuple(value / length for value in normal))
        normals = normalized_normals

    index_bytes = bytes.fromhex(index_hex.group(1))
    index_size = 2 if index_format == 0 else 4
    unpack_index = struct.Struct("<H" if index_size == 2 else "<I")
    raw_indices = [unpack_index.unpack_from(index_bytes, offset)[0] for offset in range(0, len(index_bytes), index_size)]

    submeshes = []
    for block in re.split(r"(?=^\s*- serializedVersion:)", submesh_section.group(1), flags=re.MULTILINE):
        if "indexCount:" not in block:
            continue
        first_byte = field_int(block, "firstByte")
        index_count = field_int(block, "indexCount")
        base_vertex = field_int(block, "baseVertex", 0)
        topology = field_int(block, "topology", 0)
        if topology != 0:
            raise ValueError(f"Only triangle topology is supported in {path}")
        start = first_byte // index_size
        indices = [index + base_vertex for index in raw_indices[start:start + index_count]]
        # Unity meshes use clockwise front faces; glTF uses counter-clockwise.
        for i in range(0, len(indices) - 2, 3):
            indices[i + 1], indices[i + 2] = indices[i + 2], indices[i + 1]
        submeshes.append(indices)

    return {
        "name": name,
        "positions": positions,
        "normals": normals,
        "uvs": uvs,
        "submeshes": submeshes,
        "source_bounds": {"min": mins, "max": maxs},
    }


def padded(data: bytes, fill: bytes = b"\x00") -> bytes:
    return data + fill * ((-len(data)) % 4)


def write_glb(mesh: dict, output_path: Path) -> None:
    blob = bytearray()
    buffer_views = []
    accessors = []

    def append_view(data: bytes, target: int) -> int:
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(data)
        index = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return index

    def append_accessor(view: int, component_type: int, count: int, value_type: str, **extra) -> int:
        accessor = {"bufferView": view, "componentType": component_type, "count": count, "type": value_type, **extra}
        index = len(accessors)
        accessors.append(accessor)
        return index

    positions = mesh["positions"]
    position_data = b"".join(struct.pack("<3f", *vertex) for vertex in positions)
    position_view = append_view(position_data, 34962)
    position_accessor = append_accessor(
        position_view, 5126, len(positions), "VEC3",
        min=[min(v[axis] for v in positions) for axis in range(3)],
        max=[max(v[axis] for v in positions) for axis in range(3)],
    )

    attributes = {"POSITION": position_accessor}
    if mesh["normals"]:
        normal_data = b"".join(struct.pack("<3f", *normal) for normal in mesh["normals"])
        normal_view = append_view(normal_data, 34962)
        attributes["NORMAL"] = append_accessor(normal_view, 5126, len(mesh["normals"]), "VEC3")
    if mesh["uvs"]:
        uv_data = b"".join(struct.pack("<2f", *uv) for uv in mesh["uvs"])
        uv_view = append_view(uv_data, 34962)
        attributes["TEXCOORD_0"] = append_accessor(uv_view, 5126, len(mesh["uvs"]), "VEC2")

    primitives = []
    for indices in mesh["submeshes"]:
        use_uint32 = max(indices, default=0) > 65535
        index_data = b"".join(struct.pack("<I" if use_uint32 else "<H", index) for index in indices)
        index_view = append_view(index_data, 34963)
        index_accessor = append_accessor(index_view, 5125 if use_uint32 else 5123, len(indices), "SCALAR")
        primitives.append({"attributes": attributes, "indices": index_accessor, "mode": 4})

    gltf = {
        "asset": {"version": "2.0", "generator": "KnockOut Unity Mesh Converter"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": mesh["name"]}],
        "meshes": [{"name": mesh["name"], "primitives": primitives}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_chunk = padded(json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8"), b" ")
    bin_chunk = padded(bytes(blob))
    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    glb = (
        struct.pack("<4sII", b"glTF", 2, total_length)
        + struct.pack("<I4s", len(json_chunk), b"JSON") + json_chunk
        + struct.pack("<I4s", len(bin_chunk), b"BIN\x00") + bin_chunk
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(glb)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    mesh = parse_mesh(args.source)
    write_glb(mesh, args.output)
    print(json.dumps({
        "name": mesh["name"],
        "vertices": len(mesh["positions"]),
        "triangles": sum(len(indices) for indices in mesh["submeshes"]) // 3,
        "submeshes": len(mesh["submeshes"]),
        "sourceBounds": mesh["source_bounds"],
        "output": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
