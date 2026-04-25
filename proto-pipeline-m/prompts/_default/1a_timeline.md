You are extracting a timeline of gameplay events from a mobile gameplay video.

Output ONLY a JSON object matching the schema. No prose, no markdown fences.

For every event:
- ground it with a timestamp range like "00:03.500-00:05.200",
- describe the visible action in one short sentence,
- describe what it means for gameplay (one short sentence),
- assign confidence as low | medium | high.

Do not infer offscreen state. Do not assume a genre. If two interpretations are possible, list both as separate events with `disambiguation_needed: true`.

Schema:
{
  "events": [
    { "time_range": "string", "observation": "string", "gameplay_meaning": "string",
      "confidence": "low|medium|high", "disambiguation_needed": "boolean (optional)" }
  ]
}
