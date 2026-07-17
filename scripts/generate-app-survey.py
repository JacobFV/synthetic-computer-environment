#!/usr/bin/env python3
"""Generate the evidence-backed application and fidelity survey PDF."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterable

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = Path(os.environ.get("SEED_EVIDENCE", ROOT / "artifacts/evidence-v3"))
OUTPUT = Path(os.environ.get("SEED_SURVEY_PDF", ROOT / "output/pdf/seed-computer-ecosystem-app-survey-v0.3.0.pdf"))
PAGE_W, PAGE_H = landscape(letter)

INK = HexColor("#14213D")
MUTED = HexColor("#667085")
PAPER = HexColor("#F8F6F1")
WHITE = HexColor("#FFFFFF")
MINT = HexColor("#66D4AE")
BLUE = HexColor("#82AEE8")
VIOLET = HexColor("#A996E8")
CORAL = HexColor("#EE9C73")
LINE = HexColor("#DDE3EA")

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("SeedSans", FONT))
pdfmetrics.registerFont(TTFont("SeedSans-Bold", FONT_BOLD))


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def paragraph(c: canvas.Canvas, text: str, x: float, y_top: float, width: float, height: float,
              size: float = 9.5, color=MUTED, bold: bool = False, leading: float | None = None) -> float:
    style = ParagraphStyle(
        "survey",
        fontName="SeedSans-Bold" if bold else "SeedSans",
        fontSize=size,
        leading=leading or size * 1.35,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    item = Paragraph(text, style)
    _, used = item.wrap(width, height)
    item.drawOn(c, x, y_top - used)
    return used


def fit_image(c: canvas.Canvas, image_path: Path, x: float, y: float, width: float, height: float,
              background=INK) -> None:
    c.setFillColor(background)
    c.rect(x, y, width, height, stroke=0, fill=1)
    with Image.open(image_path) as image:
        iw, ih = image.size
    scale = min(width / iw, height / ih)
    draw_w, draw_h = iw * scale, ih * scale
    c.drawImage(ImageReader(str(image_path)), x + (width - draw_w) / 2, y + (height - draw_h) / 2,
                draw_w, draw_h, preserveAspectRatio=True, mask="auto")


def page_header(c: canvas.Canvas, page_number: int, section: str) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFont("SeedSans-Bold", 7.5)
    c.setFillColor(MUTED)
    c.drawString(34, PAGE_H - 24, "SEED COMPUTER ECOSYSTEM / 0.3.0")
    c.drawRightString(PAGE_W - 34, PAGE_H - 24, f"{section.upper()}  /  {page_number:02d}")
    c.setStrokeColor(LINE)
    c.line(34, PAGE_H - 32, PAGE_W - 34, PAGE_H - 32)


def pill(c: canvas.Canvas, text: str, x: float, y: float, fill, color=INK) -> float:
    width = pdfmetrics.stringWidth(text, "SeedSans-Bold", 7.5) + 14
    c.setFillColor(fill)
    c.roundRect(x, y, width, 18, 5, stroke=0, fill=1)
    c.setFillColor(color)
    c.setFont("SeedSans-Bold", 7.5)
    c.drawCentredString(x + width / 2, y + 5.4, text)
    return width


def title(c: canvas.Canvas, value: str, subtitle: str | None = None, x: float = 42, y: float = PAGE_H - 70) -> None:
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 24)
    c.drawString(x, y, value)
    if subtitle:
        paragraph(c, subtitle, x, y - 16, PAGE_W - x * 2, 48, 10.5, MUTED)


def values_by_os(snapshot: dict[str, Any]) -> dict[str, int]:
    return {
        computer["spec"]["os"]: len(computer.get("installedApps", []))
        for computer in snapshot.get("computers", []) if computer["spec"].get("displays")
    }


snapshot = load_json(EVIDENCE / "runtime-snapshot.json")
portrait_index = load_json(EVIDENCE / "app-portrait-index.json")
manifest = load_json(EVIDENCE / "evidence-manifest.json")
catalog = {app["id"]: app for app in snapshot["appCatalog"]}
portrait_by_id = {item["appId"]: item for item in portrait_index}
audit = manifest["summary"].get("uiAudit") or {}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
c.setTitle("Seed Computer Ecosystem 0.3.0 - Application and Fidelity Survey")
c.setAuthor("Seed Computer Ecosystem")
page = 1

# Cover
c.setFillColor(INK)
c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
c.setFillColor(MINT)
c.setFont("SeedSans-Bold", 9)
c.drawString(44, PAGE_H - 54, "RESEARCH APPLICATION ATLAS / RELEASE 0.3.0")
c.setFillColor(WHITE)
c.setFont("SeedSans-Bold", 34)
c.drawString(44, PAGE_H - 110, "A computer ecosystem")
c.drawString(44, PAGE_H - 150, "whose pixels have causes")
paragraph(c, "Sixty manifest-backed applications across macOS, Windows, and Ubuntu - surveyed against their rendered product surface, declared operations, service dependencies, and authoritative runtime state.", 44, PAGE_H - 180, 650, 64, 12, HexColor("#CED7E7"))
grid = EVIDENCE / "48-desktop-states-grid.png"
if grid.exists():
    fit_image(c, grid, 44, 42, PAGE_W - 88, 290, HexColor("#090D16"))
c.setFillColor(MINT)
c.rect(44, 26, 108, 3, stroke=0, fill=1)
c.showPage(); page += 1

# Validity model
page_header(c, page, "validity model")
title(c, "A screenshot is evidence only when the state agrees", "Seed evaluates visual, interaction, semantic, and causal fidelity independently.")
diagram = ROOT / "output/diagrams/causal-proof.png"
if diagram.exists():
    fit_image(c, diagram, 42, 254, PAGE_W - 84, 155, WHITE)
axes = [
    ("01", "Platform", "OS chrome, focus, windowing, launchers and input conventions", BLUE),
    ("02", "Product", "App-specific hierarchy, vocabulary, workflow and state", VIOLET),
    ("03", "System", "Files, processes, packages, repositories, sockets and services", MINT),
    ("04", "Causal", "One action agrees across durable state, snapshots and trajectory", CORAL),
]
for index, (number, name, body, color) in enumerate(axes):
    x = 42 + index * 187
    c.setFillColor(color)
    c.rect(x, 93, 3, 116, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 8)
    c.drawString(x + 12, 189, number)
    c.setFont("SeedSans-Bold", 14)
    c.drawString(x + 12, 164, name)
    paragraph(c, body, x + 12, 146, 150, 70, 8.5, MUTED)
c.showPage(); page += 1

# Architecture
page_header(c, page, "architecture")
title(c, "Authority boundaries make the ecosystem extensible", "Turborepo schedules fourteen workspaces; the boundary checker rejects undeclared edges, cycles, and cross-package source escapes.")
architecture = ROOT / "output/diagrams/architecture.png"
if architecture.exists():
    fit_image(c, architecture, 42, 64, 540, 410, WHITE)
paragraph(c, "The kernel consumes a serialized SimulationTopology. The 2026 seed composes computers, OS profiles, application sets, services, DNS, and gateways without hiding reference-world defaults inside runtime code.", 608, 438, 145, 150, 10, INK, True)
for y, text_value, color in [
    (292, "14 workspaces", BLUE),
    (244, "30 validated internal edges", VIOLET),
    (196, "4 computers / 8 services", MINT),
    (148, "60 apps / 46 surfaces", CORAL),
]:
    c.setFillColor(color)
    c.circle(618, y + 6, 4, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 11)
    c.drawString(632, y, text_value)
c.showPage(); page += 1

# Topology and evidence
page_header(c, page, "reference ecosystem")
title(c, "Three displayed computers share one typed virtual internet")
computers = [
    ("mac-studio", "macOS 26", "10.42.0.10", "zsh", BLUE),
    ("win-workstation", "Windows 11 26H2", "10.42.0.20", "PowerShell", VIOLET),
    ("ubuntu-dev", "Ubuntu 26.04", "10.42.0.30", "bash", CORAL),
    ("seed-registry", "headless Ubuntu", "10.42.0.2", "bash", MINT),
]
for index, (host, os_name, address, shell, color) in enumerate(computers):
    x = 42 + (index % 2) * 370
    y = 334 - (index // 2) * 160
    c.setFillColor(WHITE)
    c.rect(x, y, 340, 126, stroke=0, fill=1)
    c.setFillColor(color)
    c.rect(x, y, 4, 126, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 15)
    c.drawString(x + 20, y + 91, host)
    c.setFont("SeedSans", 9)
    c.setFillColor(MUTED)
    c.drawString(x + 20, y + 69, os_name)
    c.drawString(x + 20, y + 49, f"{address}  /  {shell}")
    role = "displayed workstation" if host != "seed-registry" else "headless DNS, registry and service node"
    c.drawString(x + 20, y + 27, role)
c.showPage(); page += 1

page_header(c, page, "rendered breadth")
title(c, "Forty-eight workflows are captured at full resolution", "The contact sheet is an index; six larger per-OS plates preserve legibility, and every scene is validated against the actual installed topology.")
if grid.exists():
    fit_image(c, grid, 42, 80, PAGE_W - 84, 392, HexColor("#090D16"))
c.showPage(); page += 1

# Platform icon walls
page_header(c, page, "application inventory")
title(c, "The launchers expose the installed ecosystem - not a curated mockup")
for index, (computer_id, label) in enumerate([("mac-studio", "macOS"), ("win-workstation", "Windows"), ("ubuntu-dev", "Ubuntu")]):
    image_path = EVIDENCE / "icon-walls" / f"{computer_id}.png"
    x = 42 + index * 246
    if image_path.exists():
        fit_image(c, image_path, x, 132, 225, 360, HexColor("#090D16"))
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 11)
    c.drawCentredString(x + 112.5, 108, label)
c.showPage(); page += 1

# Coverage table
page_header(c, page, "software substrate")
title(c, "Packages and Git share the same virtual disk as applications")
native = ["brew", "mas", "apt", "dpkg", "snap", "flatpak", "winget", "choco", "scoop"]
project = ["npm", "pnpm", "yarn", "bun", "pip", "pipx", "poetry", "uv", "cargo", "go", "gem", "composer", "dotnet", "nuget", "vcpkg", "conda"]
paragraph(c, "Native and operating-system managers", 42, 446, 300, 40, 12, INK, True)
paragraph(c, " / ".join(native), 42, 414, 300, 110, 10, MUTED)
paragraph(c, "Language and project managers", 392, 446, 350, 40, 12, INK, True)
paragraph(c, " / ".join(project), 392, 414, 350, 110, 10, MUTED)
facts = [
    ("25", "manager families"),
    ("VFS", "receipts, manifests and lockfiles"),
    ("Git", "typed objects, refs and remote transport"),
    ("3", "stateful shell dialect labels"),
]
for index, (value, label) in enumerate(facts):
    x = 42 + index * 177
    c.setFillColor([BLUE, VIOLET, MINT, CORAL][index])
    c.rect(x, 123, 3, 123, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 24 if len(value) < 4 else 18)
    c.drawString(x + 14, 202, value)
    paragraph(c, label, x + 14, 176, 145, 64, 9, MUTED)
c.showPage(); page += 1

# App index
page_header(c, page, "atlas index")
title(c, "Every catalog application receives an individual rendered survey")
sorted_apps = sorted(catalog.values(), key=lambda item: (not item.get("system", False), item["name"].lower()))
columns = 4
rows = 15
for index, app in enumerate(sorted_apps):
    column = index // rows
    row = index % rows
    x = 42 + column * 184
    y = 452 - row * 26
    c.setFillColor(INK if app.get("system") else MUTED)
    c.setFont("SeedSans-Bold" if app.get("system") else "SeedSans", 8.2)
    c.drawString(x, y, f"{index + 1:02d}  {app['name']}")
c.setFont("SeedSans", 7.5)
c.setFillColor(MUTED)
c.drawString(42, 48, "Bold entries are system applications. The following pages use real Playwright portraits from compatible installed computers.")
c.showPage(); page += 1

# One page per application
for atlas_number, app in enumerate(sorted_apps, start=1):
    page_header(c, page, "application atlas")
    portrait = portrait_by_id.get(app["id"])
    kind = "SYSTEM APPLICATION" if app.get("system") else "ECOSYSTEM APPLICATION"
    x_pill = 42
    x_pill += pill(c, kind, x_pill, PAGE_H - 74, BLUE if app.get("system") else MINT) + 8
    for os_name, color in [("macOS", BLUE), ("Windows", VIOLET), ("Ubuntu", CORAL)]:
        key = "macos" if os_name == "macOS" else os_name.lower()
        if key in app.get("supportedOS", []):
            x_pill += pill(c, os_name, x_pill, PAGE_H - 74, color) + 6
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 27)
    c.drawString(42, PAGE_H - 116, app["name"])
    c.setFont("SeedSans", 8)
    c.setFillColor(MUTED)
    c.drawString(44, PAGE_H - 136, f"{app['id']}  /  {app['publisher']}  /  v{app['version']}  /  atlas {atlas_number:02d}")

    image_path = EVIDENCE / "app-portraits" / portrait["file"] if portrait else None
    if image_path and image_path.exists():
        fit_image(c, image_path, 42, 87, 492, 330, HexColor("#090D16"))

    right_x, right_w = 560, 190
    used = paragraph(c, app.get("description", ""), right_x, 443, right_w, 74, 9.2, INK, True)
    y = 443 - used - 19
    c.setFillColor(MUTED)
    c.setFont("SeedSans-Bold", 7.5)
    c.drawString(right_x, y, "DECLARED OPERATIONS")
    y -= 10
    operations = app.get("operations", [])
    used = paragraph(c, "<br/>".join(f"- {value}" for value in operations[:9]) or "- read-only surface", right_x, y, right_w, 125, 8, MUTED)
    y -= used + 16
    c.setFont("SeedSans-Bold", 7.5)
    c.drawString(right_x, y, "AUTHORITATIVE DEPENDENCIES")
    y -= 10
    capabilities = ", ".join(app.get("capabilities", [])) or "local UI state"
    services = app.get("serviceContracts", [])
    service_text = ", ".join(contract["host"] for contract in services) or "no remote service"
    used = paragraph(c, f"Capabilities: {capabilities}<br/>Services: {service_text}", right_x, y, right_w, 72, 8, MUTED)
    y -= used + 16
    c.setFont("SeedSans-Bold", 7.5)
    c.drawString(right_x, y, "RUNTIME PACKAGE")
    y -= 10
    runtime = app.get("runtime", {})
    paragraph(c, f"{runtime.get('kind', 'unknown')} / {runtime.get('entryFile', app.get('entrypoint', ''))}<br/>State schema: {runtime.get('stateSchema', 'n/a')}", right_x, y, right_w, 72, 7.8, MUTED)

    if portrait:
        c.setFont("SeedSans", 7)
        c.setFillColor(HexColor("#8791A3"))
        c.drawString(42, 67, f"Captured on {portrait['computerId']} in real Chromium. Evidence file: {portrait['file']}")
    c.showPage(); page += 1

# Evidence close
page_header(c, page, "evidence index")
title(c, "The atlas is backed by machine-readable proof")
summary = manifest["summary"]
facts = [
    (str(summary.get("workflowStates", 0)), "workflow states"),
    (str(summary.get("appPortraits", 0)), "application portraits"),
    (str(summary.get("motionRecordings", 0)), "interaction recordings"),
    (str(audit.get("inspected", 0)), "rendered app instances audited"),
    (str(audit.get("errors", 0)), "UI audit errors"),
    (str(audit.get("warnings", 0)), "UI audit warnings"),
]
for index, (value, label) in enumerate(facts):
    x = 42 + (index % 3) * 244
    y = 335 - (index // 3) * 150
    c.setFillColor([BLUE, VIOLET, MINT, CORAL, BLUE, VIOLET][index])
    c.rect(x, y, 4, 105, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("SeedSans-Bold", 29)
    c.drawString(x + 16, y + 62, value)
    paragraph(c, label, x + 16, y + 49, 190, 42, 9.5, MUTED)
paragraph(c, "Evidence hashes, dimensions, durations, the final runtime snapshot, application execution records, packet traces, and trajectory JSONL are stored under artifacts/evidence-v3. The technical report describes exactly what those artifacts prove - and what Seed does not claim.", 42, 102, PAGE_W - 84, 58, 9.5, MUTED)
c.showPage()

c.save()
print(f"wrote {OUTPUT} ({page} pages)")
