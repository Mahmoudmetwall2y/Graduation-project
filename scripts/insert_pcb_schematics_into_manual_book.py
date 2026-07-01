"""Insert the two original PCB schematics without rebuilding the manual book.

The CNN-updated manual book is copied to a new output. Only the Figure 3.4
placeholder paragraph is replaced; the user's front matter and style definitions
are retained.
"""

from copy import deepcopy
from pathlib import Path
import shutil

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from docx.shared import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "AscultiCor_Graduation_Book (2)_CNN_Updated.docx"
OUTPUT = ROOT / "docs" / "AscultiCor_Graduation_Book (2)_CNN_PCB_Updated.docx"
SCHEMATIC_A = ROOT / "docs" / "assets" / "figures" / "figure_3_4a_controller_sensor_schematic.jpg"
SCHEMATIC_B = ROOT / "docs" / "assets" / "figures" / "figure_3_4b_power_management_schematic.jpg"


def paragraph_before(anchor: Paragraph, style: str | None = None) -> Paragraph:
    element = OxmlElement("w:p")
    anchor._p.addprevious(element)
    paragraph = Paragraph(element, anchor._parent)
    if style:
        paragraph.style = style
    return paragraph


def add_image_before(anchor: Paragraph, path: Path) -> None:
    paragraph = paragraph_before(anchor)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.keep_together = True
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.add_run().add_picture(str(path), width=Inches(6.2))


def add_caption_before(anchor: Paragraph, text: str) -> None:
    paragraph = paragraph_before(anchor, "Figure Caption")
    paragraph.add_run(text)
    paragraph.paragraph_format.keep_with_next = False


def remove_paragraph(paragraph: Paragraph) -> None:
    parent = paragraph._p.getparent()
    parent.remove(paragraph._p)


def main() -> None:
    for path in (SOURCE, SCHEMATIC_A, SCHEMATIC_B):
        if not path.exists():
            raise FileNotFoundError(path)

    shutil.copy2(SOURCE, OUTPUT)
    document = Document(OUTPUT)
    placeholders = [
        paragraph
        for paragraph in document.paragraphs
        if paragraph.text.strip().lower().startswith("figure 3.4 placeholder")
    ]
    if len(placeholders) != 1:
        raise RuntimeError(f"Expected one Figure 3.4 placeholder, found {len(placeholders)}")

    anchor = placeholders[0]
    add_image_before(anchor, SCHEMATIC_A)
    add_caption_before(
        anchor,
        "Figure 3.4(a): Original AscultiCor controller and sensing schematic showing the ESP32, "
        "AD8232, MAX9814, status LED, power switch, and local decoupling.",
    )
    add_image_before(anchor, SCHEMATIC_B)
    add_caption_before(
        anchor,
        "Figure 3.4(b): Original AscultiCor power-management schematic showing USB Type-C input, "
        "TP4056 charging, DW01A/FS8205 protection, AO3401/SS34 load sharing, and battery connectors.",
    )
    remove_paragraph(anchor)

    preprocessing_placeholders = [
        paragraph
        for paragraph in document.paragraphs
        if paragraph.text.strip().lower().startswith("figure 3.7 placeholder")
    ]
    if len(preprocessing_placeholders) != 1:
        raise RuntimeError(
            f"Expected one Figure 3.7 placeholder, found {len(preprocessing_placeholders)}"
        )
    preprocessing_placeholders[0].text = (
        "Figure 3.7 placeholder — Active AI preprocessing pipelines. Use three lanes: PCG "
        "actual-rate input to 22.05 kHz traditional features and 16 kHz YAMNet embedding; "
        "ECG 500 Hz input to 125 Hz filtering, overlapping windows, RR vector, and three-input "
        "model; and CNN PCG input resampled to 22.05 kHz, normalized, converted to a 128 × 216 "
        "mel spectrogram, and arranged into AV/MV/PV/TV channels."
    )
    document.save(OUTPUT)
    print(f"Wrote PCB-schematic update: {OUTPUT}")


if __name__ == "__main__":
    main()
