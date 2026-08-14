#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$repo_dir/output/assetripper/UnityProject/ExportedProject/Assets"
mesh_dir="$source_dir/Mesh"
texture_dir="$source_dir/Texture2D"
output_model_dir="$repo_dir/public/models/game"
output_texture_dir="$repo_dir/public/models/textures"

mkdir -p "$output_model_dir" "$output_texture_dir"

convert_mesh() {
  python3 "$repo_dir/scripts/convert_unity_meshes.py" "$mesh_dir/$2.asset" "$output_model_dir/$1.glb"
}

for length in 1 2 3 4; do
  wood_cube="woodbox_1x1"
  [[ "$length" -gt 1 ]] && wood_cube="woodbox_Vertical_1x${length}"
  convert_mesh "wood-cube-y${length}" "$wood_cube"
  convert_mesh "wood-cylinder-y${length}" "Wood_Log_1x${length}"
  convert_mesh "stone-cube-y${length}" "Stone_Cube_y_1x${length}"
  convert_mesh "stone-cylinder-y${length}" "Stone_Cylinder_y_1x${length}"
  convert_mesh "metal-cube-y${length}" "MetalCube_1x${length}"
  convert_mesh "metal-cylinder-y${length}" "MetalCylinder_1x${length}"
  convert_mesh "ice-cube-y${length}" "Ice_Cube_1x${length}_rot"
  convert_mesh "ice-cylinder-y${length}" "Ice_Cylinder_y_1x${length}"
  convert_mesh "column-y${length}" "Column_1x${length}"
  convert_mesh "jelly-y${length}" "Jelly_1x${length}"
done

for length in 2 3 4; do
  convert_mesh "column-x${length}" "Column_${length}x1"
  convert_mesh "jelly-x${length}" "Jelly_${length}x1"
done

convert_mesh "plastic-cube" "Cube_1x1"
convert_mesh "plastic-cylinder" "Cylinder_1x1"
convert_mesh "plastic-cone" "pyramid_1x1"
convert_mesh "shredder" "Shredder_Static"
for length in 1 2 3; do
  convert_mesh "glass-shell-y${length}" "Jar_1x${length}_01_glass"
  convert_mesh "glass-lid-y${length}" "Jar_1x${length}_01_pieces"
done

resize_texture() {
  magick "$texture_dir/$2" -resize "${3}x${3}>" -define webp:method=6 -quality 84 "$output_texture_dir/$1.webp"
}

resize_texture "wood-cube-color" "WoodBox_Color.png" 512
resize_texture "wood-cube-normal" "WoodBox_Nrm.png" 512
resize_texture "wood-cylinder-color" "Log_Color.png" 512
resize_texture "wood-cylinder-normal" "Log_Normal.png" 512
resize_texture "stone-cube-color" "Stones_Cube_Color_V2.png" 512
resize_texture "stone-cube-normal" "Stones_Cube_Nrm.png" 512
resize_texture "stone-cylinder-color" "Stones_Cylinder_Color_v2.png" 512
resize_texture "stone-cylinder-normal" "Stones_Cylinder_Nrm.png" 512
resize_texture "metal-cube-color" "metalbox_v2_color.png" 512
resize_texture "metal-cube-metalness" "metalbox_v2_metallic.png" 512
resize_texture "metal-cube-emissive" "metalbox_v2_emission.png" 512
resize_texture "metal-cylinder-color" "metalcylinder_v2_color.png" 512
resize_texture "metal-cylinder-roughness" "metalcylinder_v2_roughness.png" 512
resize_texture "ice-cube-color" "Ice_Color.png" 512
resize_texture "ice-cube-normal" "Ice_Normal.png" 512
resize_texture "ice-cylinder-color" "Ice_Cylinder_Color.png" 512
resize_texture "ice-cylinder-normal" "Ice_Cylinder_ Nrm.png" 512
resize_texture "column-color" "Column_All_Col_v2.png" 1024
resize_texture "column-normal" "Column_All_Nrm_v1.png" 1024
resize_texture "column-metalness" "Column_All_Metallic.png" 1024
resize_texture "column-emissive" "Column_All_Emission.png" 1024
resize_texture "jelly-color" "JellyJar_Col_v1.png" 1024
resize_texture "jelly-emissive" "JellyJar_emis.png" 1024
resize_texture "shredder-color" "shredder_color_v15.png" 512
resize_texture "shredder-emissive" "shredder_emission_v15.png" 512
resize_texture "shredder-roughness" "shredder_smoothness.png" 512

echo "Built $(find "$output_model_dir" -name '*.glb' | wc -l | tr -d ' ') GLBs and $(find "$output_texture_dir" -name '*.webp' | wc -l | tr -d ' ') textures."
