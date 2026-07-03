#!/usr/bin/env python3
"""Structural validation for generated AscultiCor n8n workflow exports."""

from __future__ import annotations

import json
from pathlib import Path


WORKFLOW_DIR = Path(__file__).parent / "workflows"
EXPECTED = {f"{number:02d}" for number in range(11)}


def main() -> None:
    files = sorted(WORKFLOW_DIR.glob("*.json"))
    prefixes = {path.name.split("-", 1)[0] for path in files}
    assert prefixes == EXPECTED, (prefixes, EXPECTED)

    for path in files:
        workflow = json.loads(path.read_text(encoding="utf-8"))
        assert workflow.get("name"), path
        assert workflow.get("active") is False, path
        nodes = workflow.get("nodes") or []
        assert nodes, path

        names = [node.get("name") for node in nodes]
        assert all(names), path
        assert len(names) == len(set(names)), f"Duplicate node names in {path}"
        for node in nodes:
            assert node.get("id"), (path, node)
            assert node.get("type", "").startswith("n8n-nodes-base."), (path, node)
            assert isinstance(node.get("position"), list) and len(node["position"]) == 2

        known = set(names)
        for source, groups in (workflow.get("connections") or {}).items():
            assert source in known, (path, source)
            for branch in groups.get("main", []):
                for target in branch:
                    assert target.get("node") in known, (path, target)

        error_nodes = [node for node in nodes if node["type"] == "n8n-nodes-base.errorTrigger"]
        if path.name.startswith("08-"):
            assert len(error_nodes) == 1, path
        else:
            assert not error_nodes, path

    print(f"Validated {len(files)} n8n workflow exports")


if __name__ == "__main__":
    main()
