#!/usr/bin/env python3
"""Structural validation for generated AscultiCor n8n workflow exports."""

from __future__ import annotations

import json
from pathlib import Path


WORKFLOW_DIR = Path(__file__).parent / "workflows"
EXPECTED_FILES = {
    "00-connectivity-check.json",
    "01-process-pending-llm-reports.json",
    "02-processing-reliability.json",
    "03-clinical-alert-management.json",
    "04-device-ota-management.json",
    "05-data-integrity-research-quality.json",
    "06-operations-intelligence.json",
    "07-shared-workflow-failure-handler.json",
}
EXPECTED_SCHEDULES = {
    "02-processing-reliability.json": 2,
    "03-clinical-alert-management.json": 1,
    "04-device-ota-management.json": 1,
    "05-data-integrity-research-quality.json": 2,
    "06-operations-intelligence.json": 2,
}


def main() -> None:
    files = sorted(WORKFLOW_DIR.glob("*.json"))
    filenames = {path.name for path in files}
    assert filenames == EXPECTED_FILES, (filenames, EXPECTED_FILES)

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
        schedule_nodes = [node for node in nodes if node["type"] == "n8n-nodes-base.scheduleTrigger"]
        if path.name in EXPECTED_SCHEDULES:
            assert len(schedule_nodes) == EXPECTED_SCHEDULES[path.name], path
        if path.name.startswith("07-"):
            assert len(error_nodes) == 1, path
        else:
            assert not error_nodes, path

    print(f"Validated {len(files)} n8n workflow exports")


if __name__ == "__main__":
    main()
