import docx
doc = docx.Document(r'd:\AscultiCor-Edited\docs\Chapter 4-Hardware Design.docx')
for p in doc.paragraphs:
    print(p.text)
