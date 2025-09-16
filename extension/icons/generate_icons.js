/**
 * Icon generator script for OS Browser Bridge extension
 * This script generates PNG icons in different sizes and variants
 * Run with: node generate_icons.js
 */

const fs = require('fs');
const path = require('path');

// Try to use canvas if available, otherwise provide instructions
let Canvas, createCanvas;
try {
  const canvasModule = require('canvas');
  Canvas = canvasModule.Canvas;
  createCanvas = canvasModule.createCanvas;
} catch (e) {
  console.log('Canvas module not found. Generating simple placeholder icons...');
  console.log('For better icons, install canvas: npm install canvas');
}

const sizes = [16, 32, 48, 128];
const variants = [
  { name: 'color', fillColor: '#667eea', strokeColor: '#764ba2', statusDot: null },
  { name: 'gray', fillColor: '#9ca3af', strokeColor: '#6b7280', statusDot: null },
  { name: 'connected', fillColor: '#667eea', strokeColor: '#764ba2', statusDot: '#4ade80' },
  { name: 'disconnected', fillColor: '#667eea', strokeColor: '#764ba2', statusDot: '#ef4444' },
  { name: 'connecting', fillColor: '#667eea', strokeColor: '#764ba2', statusDot: '#fbbf24' }
];

function drawIcon(ctx, size, fillColor, strokeColor, statusDot) {
  // Clear canvas
  ctx.clearRect(0, 0, size, size);
  
  const scale = size / 128; // Base design is for 128x128
  ctx.save();
  ctx.scale(scale, scale);
  
  // Draw background circle
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  
  if (ctx.createLinearGradient) {
    const gradient = ctx.createLinearGradient(20, 20, 108, 108);
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, strokeColor);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = fillColor;
  }
  ctx.fill();
  
  // Draw bridge icon (stylized connection)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Left tower
  ctx.beginPath();
  ctx.moveTo(30, 80);
  ctx.lineTo(30, 40);
  ctx.stroke();
  
  // Right tower
  ctx.beginPath();
  ctx.moveTo(98, 80);
  ctx.lineTo(98, 40);
  ctx.stroke();
  
  // Bridge deck
  ctx.beginPath();
  ctx.moveTo(20, 80);
  ctx.lineTo(108, 80);
  ctx.stroke();
  
  // Suspension cables (main)
  ctx.beginPath();
  ctx.moveTo(30, 40);
  ctx.quadraticCurveTo(64, 55, 98, 40);
  ctx.stroke();
  
  // Vertical cables
  const cablePositions = [40, 50, 64, 78, 88];
  ctx.lineWidth = 4;
  cablePositions.forEach(x => {
    ctx.beginPath();
    const y = 40 + Math.abs((x - 64) / 34) * 15; // Calculate cable curve
    ctx.moveTo(x, y);
    ctx.lineTo(x, 80);
    ctx.stroke();
  });
  
  ctx.restore();
  
  // Draw status indicator dot if specified
  if (statusDot) {
    const dotSize = Math.max(size * 0.25, 8);
    const dotX = size - dotSize * 0.7;
    const dotY = size - dotSize * 0.7;
    
    // Draw white background for the dot
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    
    // Draw colored dot
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = statusDot;
    ctx.fill();
  }
}

// Generate simple SVG as fallback if canvas is not available
function generateSimpleSVG(size, fillColor, strokeColor, statusDot) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${fillColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${strokeColor};stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.44}" fill="url(#grad)" />
  <g stroke="white" fill="none" stroke-width="${size * 0.06}" stroke-linecap="round">
    <line x1="${size * 0.23}" y1="${size * 0.62}" x2="${size * 0.23}" y2="${size * 0.31}" />
    <line x1="${size * 0.77}" y1="${size * 0.62}" x2="${size * 0.77}" y2="${size * 0.31}" />
    <line x1="${size * 0.16}" y1="${size * 0.62}" x2="${size * 0.84}" y2="${size * 0.62}" />
    <path d="M ${size * 0.23} ${size * 0.31} Q ${size * 0.5} ${size * 0.43} ${size * 0.77} ${size * 0.31}" />
  </g>
  ${statusDot ? `
  <circle cx="${size * 0.8}" cy="${size * 0.8}" r="${size * 0.12}" fill="white" />
  <circle cx="${size * 0.8}" cy="${size * 0.8}" r="${size * 0.1}" fill="${statusDot}" />
  ` : ''}
</svg>`;
  return svg;
}

function generateIcons() {
  console.log('Generating icons...');
  
  if (createCanvas) {
    // Generate using canvas
    variants.forEach(variant => {
      sizes.forEach(size => {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        
        drawIcon(ctx, size, variant.fillColor, variant.strokeColor, variant.statusDot);
        
        const buffer = canvas.toBuffer('image/png');
        const filename = path.join(__dirname, `icon-${variant.name}-${size}.png`);
        fs.writeFileSync(filename, buffer);
        console.log(`Generated: ${filename}`);
      });
    });
  } else {
    // Generate simple SVG files as fallback
    console.log('Generating SVG placeholders (install canvas module for PNG generation)');
    variants.forEach(variant => {
      sizes.forEach(size => {
        const svg = generateSimpleSVG(size, variant.fillColor, variant.strokeColor, variant.statusDot);
        const filename = path.join(__dirname, `icon-${variant.name}-${size}.svg`);
        fs.writeFileSync(filename, svg);
        console.log(`Generated: ${filename}`);
      });
    });
  }
  
  console.log('Icon generation complete!');
}

// Run the generator
generateIcons();
