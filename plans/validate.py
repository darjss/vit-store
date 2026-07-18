#!/usr/bin/env python3
"""Validate the accepted-audit planning delivery against baseline 878c937."""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = "878c937c3621ab35002e453da563f6ba551d6e86"
ACCEPTED = set("A-01 A-03 A-04 A-07 A-09 A-10 B-01 B-02 B-03 B-04 B-05 B-06 B-07 D-01 D-03 D-04 D-08 D-10 S-03 S-04 S-05 S-06 P-01 P-02 P-04 P-05".split())
REJECTED = set("A-02 A-05 A-08 A-11 D-02 D-05 D-06 D-09 S-01 S-02 P-03".split())
NEEDS_INFO = set("A-07 A-10 B-02 B-05 B-07 S-03 S-04 D-08 D-10 S-06 P-01 P-02 P-05".split())
GENERIC_VERIFY = (
    "Run the relevant inventory/read-only check",
    "Run the focused static or real-system gate described below",
    "expected: the stated behavior only",
)
ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT / "plans"
HTML = Path("/home/darjs/dev/orch-v2/projects/vit-store-28fbcaee/runs/2026-07-18T07-37-41-293Z-5da594db/reports/final/plans-and-issue-proposal.html")


def fail(message: str) -> None:
    raise AssertionError(message)


def git_show(path: str) -> list[str]:
    result = subprocess.run(
        ["git", "show", f"{BASE}:{path}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


def validate_plan(path: Path) -> str:
    text = path.read_text()
    ids = re.findall(r"^- \*\*Accepted audit ID\*\*: ([A-Z]-\d{2})$", text, re.M)
    if len(ids) != 1:
        fail(f"{path.name}: expected one accepted ID, got {ids}")
    for phrase in GENERIC_VERIFY:
        if phrase in text:
            fail(f"{path.name}: generic verification wording: {phrase}")
    steps = re.findall(r"^### Step (\d+):", text, re.M)
    if steps != ["1", "2", "3"]:
        fail(f"{path.name}: expected steps 1-3, got {steps}")
    if text.count("**Verify**:") != 3:
        fail(f"{path.name}: every step must have one verification")
    step_blocks = re.findall(r"^### Step \d+:.*?(?=^### Step \d+:|^No unit or integration tests)", text, re.M | re.S)
    for index, step in enumerate(step_blocks, 1):
        verification = step.split("**Verify**:", 1)[1]
        if index < 3 and ("`" not in verification or "→" not in verification):
            fail(f"{path.name}: step {index} lacks an exact command and observable expected result")
        if index == 3:
            for label in (
                "**Prerequisites/setup:**",
                "**Bounded procedure:**",
                "**Machine-observable expected result:**",
                "**Cleanup:**",
            ):
                if label not in verification:
                    fail(f"{path.name}: step 3 lacks {label}")
    match = re.search(
        r"\*\*Baseline source:\*\* `([^`]+):(\d+)-(\d+)`\n\n```[^\n]*\n(.*?)\n```",
        text,
        re.S,
    )
    if not match:
        fail(f"{path.name}: missing standardized baseline excerpt")
    source, start_text, end_text, block = match.groups()
    start, end = int(start_text), int(end_text)
    count = end - start + 1
    if not 3 <= count <= 12:
        fail(f"{path.name}: excerpt has {count} lines, expected 3-12")
    expected = "\n".join(git_show(source)[start - 1 : end])
    if block != expected:
        fail(f"{path.name}: excerpt does not match {BASE}:{source}:{start}-{end}")
    if ids[0] in NEEDS_INFO and "### Step 1:" not in text:
        fail(f"{path.name}: needs-info plan lacks first-step gate")
    return ids[0]


def validate_dependencies(children: list[dict]) -> None:
    keys = {child["key"] for child in children}
    graph = {child["key"]: child["blockedBy"] for child in children}
    for key, blockers in graph.items():
        if not set(blockers) <= keys:
            fail(f"{key}: unresolved dependency key")

    def visit(key: str, active: set[str]) -> None:
        if key in active:
            fail(f"dependency cycle reaches {key}")
        for blocker in graph[key]:
            visit(blocker, active | {key})

    for key in keys:
        visit(key, set())


def validate_public(children: list[dict], markdown: str, rendered: str) -> None:
    allowed_labels = {"ready-for-agent", "ready-for-human", "needs-info"}
    for child in children:
        child_id = child["acceptedId"]
        if child["label"] not in allowed_labels:
            fail(f"{child_id}: noncanonical label")
        gates = child.get("informationGates", [])
        if child_id in NEEDS_INFO:
            if not gates:
                fail(f"{child_id}: needs-info child has no information gate")
            blocked_section = child["body"].split("## Blocked by\n\n", 1)[1]
            if "None — can start immediately" in blocked_section:
                fail(f"{child_id}: needs-info child claims it can start")
            for gate in gates:
                if gate not in blocked_section or gate not in markdown or gate not in rendered:
                    fail(f"{child_id}: information gate missing from JSON/Markdown/HTML")
        if child_id in {"S-03", "P-01"} and (not child["blockedBy"] or not gates):
            fail(f"{child_id}: must contain both child dependency and information gate")
        body = child["body"]
        if re.search(r"\b(?:apps|packages|scripts|docs)/|\.(?:ts|tsx|astro|json):?\d|```", body):
            fail(f"{child_id}: public body contains brittle path/code")


def validate_copy_content(children: list[dict], rendered: str, parent: dict) -> None:
    copied = [html.unescape(value) for value in re.findall(r'data-copy="([^"]*)"', rendered)]
    expected_children = {f"# {child['title']}\n\n{child['body']}" for child in children}
    observed_children = {value for value in copied if value.startswith("# ") and not value.startswith(f"# {parent['title']}")}
    if expected_children != observed_children:
        fail("individual rendered copy content differs from JSON drafts")
    full = f"# {parent['title']}\n\n{parent['body']}\n\n" + "\n\n".join(
        f"## {child['acceptedId']} — {child['title']}\n\n{child['body']}" for child in children
    )
    if copied.count(full) != 1:
        fail("rendered full-proposal copy content differs from JSON")


def main() -> None:
    plan_files = sorted(PLANS.glob("[0-9][0-9][0-9]-*.md"))
    if len(plan_files) != 26:
        fail(f"expected 26 plans, got {len(plan_files)}")
    if [int(path.name[:3]) for path in plan_files] != list(range(1, 27)):
        fail("plan numbering is not contiguous 001-026")
    plan_ids = [validate_plan(path) for path in plan_files]
    if set(plan_ids) != ACCEPTED or len(plan_ids) != len(set(plan_ids)):
        fail("plan accepted-ID set mismatch or duplicate")

    readme = (PLANS / "README.md").read_text()
    all_plans = "\n".join(path.read_text() for path in plan_files)
    for finding in ACCEPTED:
        if len(re.findall(rf"\b{re.escape(finding)}\b", readme)) != 1:
            fail(f"{finding}: README mapping count is not one")
    for finding in REJECTED:
        if len(re.findall(rf"\b{re.escape(finding)}\b", readme)) != 1 or finding in all_plans:
            fail(f"{finding}: rejected boundary failed")
    if "A-06" in all_plans or readme.count("A-06") != 1 or "No note provided" not in readme:
        fail("A-06 discussion-only boundary failed")

    proposal = json.loads((PLANS / "github-issue-proposal.json").read_text())
    children = proposal["children"]
    if len(children) != 26 or {child["acceptedId"] for child in children} != ACCEPTED:
        fail("JSON child accepted-ID set mismatch")
    validate_dependencies(children)
    markdown = (PLANS / "github-issue-proposal.md").read_text()
    markdown_ids = re.findall(r"^### ([A-Z]-\d{2}) / Plan ", markdown, re.M)
    if markdown_ids != [child["acceptedId"] for child in children]:
        fail("Markdown/JSON child ordering mismatch")
    if any(finding in markdown or finding in json.dumps(proposal) for finding in REJECTED):
        fail("rejected finding leaked into proposal")
    discussion = proposal["needsDiscussion"]
    if discussion["id"] != "A-06" or discussion["publishable"] is not False or markdown.count("A-06") != 1:
        fail("A-06 proposal boundary failed")

    rendered = HTML.read_text()
    if rendered.count('<article class="draft"') != 26:
        fail("rendered HTML does not contain 26 child articles")
    if rendered.count("data-copy=") != 27 or 'id="copy-all"' not in rendered:
        fail("rendered HTML does not contain 26 individual copy controls plus copy-all")
    for responsive_anchor in ("@media(max-width:560px)", "@media(prefers-reduced-motion:reduce)", "max-width:100%"):
        if responsive_anchor not in rendered:
            fail(f"rendered HTML lacks static responsive anchor {responsive_anchor}")
    validate_public(children, markdown, rendered)
    validate_copy_content(children, rendered, proposal["parent"])

    for doc in PLANS.glob("*.md"):
        for link in re.findall(r"\[[^]]*\]\(([^)]+)\)", doc.read_text()):
            if "://" not in link and not link.startswith("#") and not (doc.parent / link).exists():
                fail(f"{doc.name}: missing local Markdown link {link}")

    public = markdown + (PLANS / "github-issue-proposal.json").read_text() + rendered
    secret_patterns = (
        r"(?i)bearer\s+[A-Za-z0-9._-]{12,}",
        r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*[\"'][^\"']+",
        r"\b\d{8}\b",
        r"ns_[A-Za-z0-9]{10,}",
    )
    for pattern in secret_patterns:
        if re.search(pattern, public):
            fail(f"public safety pattern matched: {pattern}")

    outside = subprocess.run(
        ["git", "diff", "--quiet", BASE, "--", ".", ":(exclude)plans/**"],
        cwd=ROOT,
    )
    if outside.returncode != 0:
        fail("diff contains a repository file outside plans/")

    print(
        "PASS plans=26 excerpts=26-contiguous accepted=26 rejected=11 "
        "needs-info-gates=13 dependencies=acyclic json=parse markdown-links=valid "
        "copy-content=exact public-scan=clean diff=plans-only"
    )


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, IndexError, OSError, subprocess.CalledProcessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
