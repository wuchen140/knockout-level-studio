const LEGACY_WEAPON_TYPES = new Set(["cannon", "attackBall"]);

export function withoutLegacyWeapons(level) {
  if (!level || !Array.isArray(level.objects)) return level;
  const objects = level.objects.filter((item) => !LEGACY_WEAPON_TYPES.has(item.type));
  return objects.length === level.objects.length ? level : { ...level, objects };
}
