from __future__ import annotations

from typing import Any


def render_brief(video_breakdown: dict[str, Any], feature_spec: dict[str, Any]) -> str:
    title = feature_spec.get("prototype_name", "Playable Prototype")
    core_loop = video_breakdown.get("core_loop", {})
    gameplay = feature_spec.get("gameplay", {})
    parameters = feature_spec.get("parameters", [])
    assets = feature_spec.get("asset_plan", [])
    criteria = feature_spec.get("acceptance_criteria", [])

    lines = [
        f"# {title}",
        "",
        "## Video Understanding",
        f"- Core loop: {core_loop.get('one_sentence', 'n/a')}",
        f"- Player goal: {core_loop.get('player_goal', 'n/a')}",
        f"- Fun driver: {core_loop.get('why_it_is_fun', 'n/a')}",
        "",
        "## Playable Spec",
        f"- Summary: {feature_spec.get('implementation_summary', 'n/a')}",
        f"- Objective: {gameplay.get('objective', 'n/a')}",
        f"- Primary interaction: {gameplay.get('primary_interaction', 'n/a')}",
        f"- Win condition: {gameplay.get('win_condition', 'n/a')}",
        "",
        "## Assets",
    ]
    for item in assets[:10]:
        lines.append(
            f"- {item.get('asset_path', 'n/a')}: {item.get('use', 'n/a')} "
            f"({item.get('processing', 'n/a')})"
        )
    lines.extend(["", "## Variation Parameters"])
    for item in parameters:
        lines.append(
            f"- {item.get('name', 'n/a')} = {item.get('default', 'n/a')}: "
            f"{item.get('gameplay_effect', 'n/a')}"
        )
    lines.extend(["", "## Acceptance Criteria"])
    for criterion in criteria:
        lines.append(f"- {criterion}")
    return "\n".join(lines).strip() + "\n"

