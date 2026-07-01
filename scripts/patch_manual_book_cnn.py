"""Patch CNN-related content into the user's manually formatted graduation book.

The supplied manual DOCX is never modified. Paragraph properties and destination
styles are retained; only targeted paragraph contents and table-cell contents are
updated. Image-bearing CNN result sections are merged separately through Word so
relationships are copied safely.
"""

from copy import deepcopy
from pathlib import Path
import shutil

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "docs" / "AscultiCor_Graduation_Book (2).docx"
DONOR = ROOT / "docs" / "AscultiCor_Graduation_Book_Template_Filled.docx"
OUTPUT = ROOT / "docs" / "AscultiCor_Graduation_Book (2)_CNN_Updated.docx"


def find_paragraph(document, prefix: str):
    matches = [p for p in document.paragraphs if p.text.strip().startswith(prefix)]
    if len(matches) > 1:
        non_toc = [p for p in matches if not p.style.name.lower().startswith("toc")]
        if len(non_toc) == 1:
            return non_toc[0]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one paragraph starting {prefix!r}, found {len(matches)}")
    return matches[0]


def replace_paragraph_content(destination, source) -> None:
    """Copy runs/fields while retaining the destination paragraph properties."""
    p_pr = destination._p.pPr
    for child in list(destination._p):
        if child is not p_pr:
            destination._p.remove(child)
    for child in source._p:
        if child.tag.endswith("}pPr"):
            continue
        destination._p.append(deepcopy(child))


def insert_paragraph_after(destination_anchor, source_paragraph):
    clone = deepcopy(source_paragraph._p)
    destination_anchor._p.addnext(clone)
    return clone


def table_by_header(document, headers: tuple[str, ...]):
    matches = []
    for table in document.tables:
        actual = tuple(cell.text.strip() for cell in table.rows[0].cells)
        if actual == headers:
            matches.append(table)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one table headed {headers!r}, found {len(matches)}")
    return matches[0]


def copy_table_content(destination, source) -> None:
    if len(destination.rows) != len(source.rows) or len(destination.columns) != len(source.columns):
        raise RuntimeError(
            f"Table shape mismatch: destination={len(destination.rows)}x{len(destination.columns)}, "
            f"source={len(source.rows)}x{len(source.columns)}"
        )
    for dst_row, src_row in zip(destination.rows, source.rows):
        for dst_cell, src_cell in zip(dst_row.cells, src_row.cells):
            if len(dst_cell.paragraphs) == len(src_cell.paragraphs):
                for dst_p, src_p in zip(dst_cell.paragraphs, src_cell.paragraphs):
                    replace_paragraph_content(dst_p, src_p)
            else:
                dst_cell.text = src_cell.text


def insert_appendix_e_cnn_summary(destination, donor) -> None:
    if any(p.text.startswith("Table E.3") for p in destination.paragraphs):
        return
    target = find_paragraph(destination, "Appendix F: n8n Workflow Inventory")
    caption = find_paragraph(donor, "Table E.3 — CNN matrix-derived evaluation summary")
    note = find_paragraph(donor, "These values were derived from the six delivered confusion-matrix images")
    table = table_by_header(donor, ("Head", "Matrix examples", "Accuracy", "Macro F1-score"))
    target._p.addprevious(deepcopy(caption._p))
    target._p.addprevious(deepcopy(table._tbl))
    target._p.addprevious(deepcopy(note._p))


def main() -> None:
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    if not DONOR.exists():
        raise FileNotFoundError(DONOR)
    shutil.copy2(MASTER, OUTPUT)

    destination = Document(OUTPUT)
    donor = Document(DONOR)

    paragraph_mappings = [
        # Front matter and Chapter 1
        ("AscultiCor is an educational cardiac-monitoring prototype", "AscultiCor is an educational cardiac-monitoring prototype"),
        ("Artificial intelligence provides a second layer of value", "Artificial intelligence provides a second layer of value"),
        ("The implemented scope includes a portable prototype", "The implemented scope includes a portable prototype"),
        ("4. A registry-driven analysis layer", "4. A registry-driven analysis layer"),
        # Chapter 2
        ("AscultiCor's registry separates", "AscultiCor's registry separates"),
        ("The current AscultiCor ECG path uses", "The current AscultiCor ECG path uses"),
        # Chapter 3 outside the Model 3 subsection copied through Word
        ("The AI workstream converts reconstructed ECG and PCG recordings", "The AI workstream converts reconstructed ECG and PCG recordings"),
        ("The deployed pipeline is triggered after the MQTT handler", "The deployed pipeline is triggered after the MQTT handler"),
        ("Figure 3.6 placeholder", "Figure 3.6 placeholder"),
        ("The project currently contains validation images", "The project currently contains validation images"),
        ("Each registry slot has a state", "Each registry slot has a state"),
        ("Model performance on public data", "Model performance on public data"),
        ("Prediction cards read structured JSON", "Prediction cards read structured JSON"),
        ("Chapter 3 described AscultiCor", "Chapter 3 described AscultiCor"),
        ("The chapter also identified implementation limitations", "The chapter also identified implementation limitations"),
        # Chapter 4 outside the CNN subsection copied through Word
        ("The most mature quantitative evidence", "The most extensive quantitative package"),
        ("Figure 4.14 Placeholder — Hardware Validation Test Bench", "Figure 4.16 Placeholder — Hardware Validation Test Bench"),
        ("The two available AI packages", "The three active AI packages"),
        ("Table 4.6: AI evidence-completeness comparison", "Table 4.7: AI evidence-completeness comparison"),
        ("The Python inference package passed recursive syntax compilation", "The Python inference package passed recursive syntax compilation"),
        ("Table 4.7: End-to-end timing fields to capture", "Table 4.8: End-to-end timing fields to capture"),
        ("Figure 4.15 Placeholder — End-to-End Evidence Timeline", "Figure 4.17 Placeholder — End-to-End Evidence Timeline"),
        ("Selected-case bias affects the ECG evidence", "Selected-case bias affects the ECG evidence"),
        ("The immediate evidence priorities are therefore", "The immediate evidence priorities are therefore"),
        ("This chapter reported the results available", "This chapter reported the results available"),
        ("The web source passes linting and type checking", "The web source passes linting and type checking"),
        # Chapter 5
        ("The AI layer currently contains two active inference paths", "The AI layer contains three active inference paths"),
        ("The third contribution is an inspectable model registry", "The third contribution is an inspectable three-model registry"),
        ("The AI limitations include incomplete provenance", "The AI limitations include incomplete provenance"),
        ("The murmur-severity CNN should remain disabled", "The active murmur-characterization CNN should now be strengthened"),
        ("The most important next step is not to make the prototype appear finished", "The most important next step is not to make the prototype appear finished"),
        # Appendix G introduction
        ("This checklist reflects the current two-active-model registry", "This checklist reflects the current three-active-model registry"),
    ]

    for destination_prefix, donor_prefix in paragraph_mappings:
        replace_paragraph_content(
            find_paragraph(destination, destination_prefix),
            find_paragraph(donor, donor_prefix),
        )

    table_headers = [
        ("Team workstream", "Principal objective", "Main outputs"),
        ("Pipeline", "Source category", "Runtime labels or outputs", "Main governance concern"),
        ("Slot", "Runtime state", "Primary artifact", "Input summary", "Output summary"),
        ("Workstream", "Check or artifact", "Result", "Evidence class"),
        ("Model slot", "Task", "Aggregate held-out evidence", "Case evidence", "Deployment state", "Principal open issue"),
        ("Workstream and objective", "Evidence available", "Assessment"),
        ("Slot", "State", "Artifact and input contract", "Output and evidence status"),
        ("Area", "Release requirement", "Current book evidence"),
        ("ID", "Workstream", "Test and acceptance evidence", "Status"),
    ]
    for headers in table_headers:
        copy_table_content(table_by_header(destination, headers), table_by_header(donor, headers))

    # Add the new CNN discussion paragraph after the existing ECG discussion.
    if not any(p.text.startswith("The active CNN has stronger aggregate evidence") for p in destination.paragraphs):
        anchor = find_paragraph(destination, "The ECG model is promising as an integrated multi-output artifact")
        source = find_paragraph(donor, "The active CNN has stronger aggregate evidence")
        insert_paragraph_after(anchor, source)

    insert_appendix_e_cnn_summary(destination, donor)
    destination.save(OUTPUT)
    print(f"Wrote targeted manual-format patch: {OUTPUT}")


if __name__ == "__main__":
    main()
