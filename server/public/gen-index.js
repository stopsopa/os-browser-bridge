#!/usr/bin/env node

import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read all files in the directory and filter for .html files, excluding index.html
const htmlFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.html') && file !== 'index.html');

// Generate HTML content with list of links
let htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Index of HTML Files</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        ul { list-style-type: none; padding: 0; }
        li { margin: 5px 0; }
        a { text-decoration: none; color: #0645AD; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>Index of HTML Files</h1>
    <ul>
`;

// Add list items for each HTML file
htmlFiles.forEach(file => {
    htmlContent += `        <li><a href="${file}">${file}</a></li>\n`;
});

htmlContent += `    </ul>\n</body>\n</html>`;

// Write the generated HTML to index.html in the same directory
fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');

console.log('Generated index.html with links to HTML files.');
