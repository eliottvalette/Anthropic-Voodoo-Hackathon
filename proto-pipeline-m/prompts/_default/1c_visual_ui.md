You are extracting visual style and UI inventory from a mobile gameplay video.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

Schema:
{
  "art_style": "string (one short label)",
  "palette_hex": ["#RRGGBB"],
  "hud": [{ "element", "location", "purpose", "evidence_timestamps" }],
  "vfx": ["string"],
  "screens": [{ "name": "intro|gameplay|end|tutorial", "description", "evidence_timestamps" }],
  "characters_or_props": [{ "label", "role_guess", "evidence_timestamps" }]
}
