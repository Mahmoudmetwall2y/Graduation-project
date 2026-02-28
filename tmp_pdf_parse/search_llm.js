const fs = require('fs');
const PDFParser = require('pdf2json');

let pdfParser = new PDFParser(this, 1);

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', pdfData => {
    let rawText = pdfParser.getRawTextContent().toLowerCase();

    const targets = ['llm', 'gpt', 'llama', 'openai', 'anthropic', 'claude', 'gemini', 'mistral', 'deepseek', 'language model', 'report'];

    let found = [];
    targets.forEach(t => {
        if (rawText.includes(t)) {
            let index = rawText.indexOf(t);
            found.push(`${t} found at index ${index}. snippet: "${rawText.substring(Math.max(0, index - 50), Math.min(rawText.length, index + 50)).replace(/\n/g, ' ')}"`);
        }
    });

    if (found.length > 0) {
        console.log("Found references:\n" + found.join('\n'));
    } else {
        console.log("No specific LLM or report references found in the document.");
    }
});

pdfParser.loadPDF('../iEEE.pdf');
