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
        body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
        h1 { font-size: 20px; margin-bottom: 24px; }
        /* two even columns (title | filename) without table borders, li is "dissolved" so its children become grid cells */
        ul {
            list-style-type: none;
            padding: 0;
            display: grid;
            grid-template-columns: max-content max-content;
            column-gap: 40px;
            row-gap: 10px;
            align-items: baseline;

            li { display: contents; }
            span { font-family: monaco, Consolas, monospace; font-size: 12px; color: #777; }
        }
        a { text-decoration: none; color: #0645AD; }
        a:hover { text-decoration: underline; }
        @media (max-width: 700px) {
            ul { grid-template-columns: 1fr; row-gap: 2px; }
            span { margin-bottom: 12px; }
        }
    </style>
</head>
<body>
    <h1>Index of HTML Files</h1>
    <ul>
`;

/**
 * Extracts content of <title> tag from given html file.
 * Returns filename if there is no title or title is empty.
 */
function getTitle(file) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');

    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    const title = match ? match[1].replace(/\s+/g, ' ').trim() : '';

    return title || file;
}

// Add list items for each HTML file: link with page title and filename in brackets behind it
htmlFiles.forEach(file => {
    htmlContent += `        <li><a href="${file}">${getTitle(file)}</a> <span>[${file}]</span></li>\n`;
});

htmlContent += `    </ul>\n</body>\n</html>`;

// Write the generated HTML to index.html in the same directory
fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');

console.log('Generated index.html with links to HTML files.');
