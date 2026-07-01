"""Replace numbered figure placeholders in the manual graduation book.

The source document is never modified. Each placeholder such as
``Figure 2.3 placeholder`` is replaced with the equally numbered PNG from
``docs/Grad-figures`` and followed by a concise caption derived from the
placeholder's first sentence.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from docx.text.paragraph import Paragraph


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "AscultiCor_Graduation_Book (2)_CNN_PCB_Updated.docx"
FIGURE_DIR = ROOT / "docs" / "Grad-figures"
OUTPUT = ROOT / "docs" / "AscultiCor_Graduation_Book (2)_CNN_PCB_Professional_Figure_Layout.docx"

CAPTIONS = {
    "1.1": "AscultiCor concept overview.",
    "1.2": "Team workstream responsibility map.",
    "1.3": "High-level AscultiCor architecture.",
    "2.1": "Cardiac cycle and multimodal signal timing.",
    "2.2": "Simplified ECG morphology and intervals.",
    "2.3": "PCG cycle and conceptual murmur timing.",
    "2.4": "Taxonomy of cardiac-signal AI methods.",
    "2.5": "Related-work landscape and the AscultiCor integration gap.",
    "3.1": "Complete AscultiCor system architecture.",
    "3.2": "End-to-end recording-session sequence.",
    "3.3": "Hardware wiring and patient interface.",
    "3.5": "Firmware state machine and concurrency model.",
    "3.6": "AI training-to-deployment architecture.",
    "3.7": "Active AI preprocessing pipelines.",
    "3.8": "Frontend and backend component architecture.",
    "3.9": "n8n automation and integration map.",
    "3.10": "Deployment architecture and trust zones.",
    "3.11": "Cross-team fault detection and recovery flow.",
    "4.16": "Hardware validation test bench.",
    "4.17": "End-to-end evidence timeline.",
    "5.1": "Three-horizon future-work roadmap.",
}

# Detailed system diagrams need the full text width; simpler conceptual figures
# benefit from a little surrounding white space.
WIDTHS = {
    "1.1": 6.10, "1.2": 5.45, "1.3": 6.10,
    "2.1": 5.75, "2.2": 5.20, "2.3": 5.45, "2.4": 5.75, "2.5": 5.50,
    "3.1": 6.15, "3.2": 6.15, "3.3": 5.85, "3.5": 5.65,
    "3.6": 6.15, "3.7": 6.15, "3.8": 6.10, "3.9": 6.10,
    "3.10": 6.15, "3.11": 6.00,
    "4.16": 5.65, "4.17": 5.85, "5.1": 5.90,
}

PLACEHOLDER_RE = re.compile(
    r"^Figure\s+(?P<number>\d+\.\d+)\s+placeholder\s*[—–-]\s*(?P<description>.+)$",
    re.IGNORECASE | re.DOTALL,
)


def concise_caption(number: str, description: str) -> str:
    if number in CAPTIONS:
        return f"Figure {number}: {CAPTIONS[number]}"
    first_sentence = re.split(r"(?<=[.!?])\s+", description.strip(), maxsplit=1)[0]
    first_sentence = re.sub(r"^Insert\s+(?:a|an|the)\s+", "", first_sentence, flags=re.I)
    first_sentence = re.sub(r":\s*Insert\s+(?:a|an|the)\s+", ": ", first_sentence, flags=re.I)
    first_sentence = first_sentence.rstrip(".")
    return f"Figure {number}: {first_sentence}."


def add_lead_in(paragraph: Paragraph, number: str) -> None:
    """Add an explicit textual reference unless nearby prose already has one."""
    previous_text = []
    sibling = paragraph._p.getprevious()
    while sibling is not None and len(previous_text) < 3:
        if sibling.tag == qn("w:p"):
            text = "".join(sibling.itertext()).strip()
            if text:
                previous_text.append(text)
        sibling = sibling.getprevious()
    if any(re.search(rf"\bFigure\s+{re.escape(number)}\b", text, re.I) for text in previous_text):
        return

    lead = OxmlElement("w:p")
    paragraph._p.addprevious(lead)
    lead_paragraph = Paragraph(lead, paragraph._parent)
    lead_paragraph.style = "Normal"
    lead_paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    lead_paragraph.paragraph_format.space_after = Pt(4)
    title = CAPTIONS[number].rstrip(".")
    lead_paragraph.add_run(f"Figure {number} summarizes the {title[0].lower() + title[1:] }.")


def replace_placeholder(paragraph: Paragraph, image: Path, number: str, description: str) -> None:
    add_lead_in(paragraph, number)
    document = paragraph._parent.part.document
    table = document.add_table(rows=2, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table._tbl.getparent().remove(table._tbl)
    paragraph._p.addprevious(table._tbl)

    # Keep the academic layout clean by using the table structurally without
    # showing borders around the image and caption.
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        border = OxmlElement(f"w:{edge}")
        border.set(qn("w:val"), "nil")
        borders.append(border)
    tbl_pr.append(borders)

    image_cell = table.cell(0, 0)
    image_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    image_paragraph = image_cell.paragraphs[0]
    image_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    image_paragraph.paragraph_format.keep_together = True
    image_paragraph.paragraph_format.space_before = Pt(3)
    image_paragraph.paragraph_format.space_after = Pt(3)
    image_paragraph.add_run().add_picture(str(image), width=Inches(WIDTHS[number]))

    caption_cell = table.cell(1, 0)
    caption_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    caption = caption_cell.paragraphs[0]
    try:
        caption.style = "Figure Caption"
    except KeyError:
        caption.style = "Caption"
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.keep_with_next = False
    caption.paragraph_format.space_before = Pt(3)
    caption.paragraph_format.space_after = Pt(8)
    run = caption.add_run(concise_caption(number, description))
    run.font.name = "Times New Roman"
    run.font.size = Pt(10)
    run.italic = True

    # Prevent either row from splitting across pages.
    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        cant_split = OxmlElement("w:cantSplit")
        tr_pr.append(cant_split)

    paragraph._p.getparent().remove(paragraph._p)


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    images = {path.stem: path for path in FIGURE_DIR.glob("*.png")}
    if not images:
        raise RuntimeError(f"No PNG figures found in {FIGURE_DIR}")

    # Work on a copy so a currently open source document remains untouched.
    shutil.copy2(SOURCE, OUTPUT)
    document = Document(OUTPUT)
    matches: list[tuple[Paragraph, re.Match[str]]] = []
    for paragraph in document.paragraphs:
        match = PLACEHOLDER_RE.match(paragraph.text.strip())
        if match:
            matches.append((paragraph, match))

    placeholder_numbers = {match.group("number") for _, match in matches}
    image_numbers = set(images)
    missing = sorted(placeholder_numbers - image_numbers)
    unused = sorted(image_numbers - placeholder_numbers)
    if missing or unused:
        raise RuntimeError(f"Figure mismatch; missing images={missing}, unused images={unused}")

    for paragraph, match in matches:
        number = match.group("number")
        replace_placeholder(paragraph, images[number], number, match.group("description"))

    document.save(OUTPUT)
    print(f"Inserted {len(matches)} figures")
    print(OUTPUT)


if __name__ == "__main__":
    main()
