import fs from "node:fs";
import path from "node:path";

const sourceRoot = "/Users/wuchen/Documents/ChatGPT/Royal Smash/outputs/royal_smash_block_models_图鉴ID_20260827/models";
const outputRoot = path.resolve(import.meta.dirname, "../public/models/royal-smash/shader-textures");
const modelIds = { blue: 4012, orange: 4013, pink: 4014, purple: 4015, red: 4016, yellow: 4017 };

fs.mkdirSync(outputRoot, { recursive: true });
for (const [color, modelId] of Object.entries(modelIds)) {
  const textureRoot = path.join(sourceRoot, String(modelId), "textures");
  const source = fs.readdirSync(textureRoot).find((name) => name.includes("__MatCapTex__"));
  if (!source) throw new Error(`图鉴 ${modelId} 缺少果酱罐 MatCap`);
  fs.copyFileSync(path.join(textureRoot, source), path.join(outputRoot, `jamjar-${color}-matcap.png`));
}

const maskRoot = path.join(sourceRoot, "4017", "textures");
const mask = fs.readdirSync(maskRoot).find((name) => name.includes("__MatCapMask__"));
if (!mask) throw new Error("图鉴 4017 缺少果酱罐 MatCap Mask");
fs.copyFileSync(path.join(maskRoot, mask), path.join(outputRoot, "jamjar-mask.png"));

console.log(JSON.stringify({ output: outputRoot, files: fs.readdirSync(outputRoot).sort() }, null, 2));
