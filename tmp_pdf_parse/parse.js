const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('../iEEE.pdf');

pdf(dataBuffer).then(function (data) {
    fs.writeFileSync('output.txt', data.text);
    console.log("Extracted text successfully.");
}).catch(function (error) {
    console.error("Error reading PDF:", error);
});
