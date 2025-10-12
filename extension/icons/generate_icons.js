/**
 * Icon generator script for OS Browser Bridge extension
 * This script generates PNG icons in different sizes and variants
 * Run with: node generate_icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to use canvas if available, otherwise provide instructions
let Canvas, createCanvas;
try {
  const canvasModule = await import('canvas');
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
  
  // Draw bridge icon (suspension bridge)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Bridge deck (roadway)
  ctx.beginPath();
  ctx.moveTo(15, 85);
  ctx.lineTo(113, 85);
  ctx.stroke();
  
  // Bridge deck supports (underneath)
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(15, 88);
  ctx.lineTo(113, 88);
  ctx.stroke();
  
  // Left tower
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(32, 88);
  ctx.lineTo(32, 30);
  ctx.stroke();
  
  // Right tower
  ctx.beginPath();
  ctx.moveTo(96, 88);
  ctx.lineTo(96, 30);
  ctx.stroke();
  
  // Tower tops
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(28, 30);
  ctx.lineTo(36, 30);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(92, 30);
  ctx.lineTo(100, 30);
  ctx.stroke();
  
  // Main suspension cables
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 35);
  ctx.quadraticCurveTo(64, 62, 96, 35);
  ctx.stroke();
  
  // Vertical suspension cables
  ctx.lineWidth = 2;
  const cablePositions = [42, 52, 64, 76, 86];
  cablePositions.forEach(x => {
    ctx.beginPath();
    // Calculate the curve position for each cable
    const t = (x - 32) / (96 - 32); // normalize position between towers
    const curveY = 35 + 27 * 4 * t * (1 - t); // quadratic curve formula
    ctx.moveTo(x, curveY);
    ctx.lineTo(x, 85);
    ctx.stroke();
  });
  
  // Side cables to anchor points
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(15, 85);
  ctx.lineTo(32, 35);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(113, 85);
  ctx.lineTo(96, 35);
  ctx.stroke();
  
  ctx.restore();
  
  // Draw status indicator dot if specified
  if (statusDot) {
    const dotSize = Math.max(size * 0.375, 12); // Increased from 0.25 to 0.375 (50% bigger)
    const dotX = size - dotSize * 0.7;
    const dotY = size - dotSize * 0.7;
    
    // Draw black border circle
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
    
    // Draw colored dot inside
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize * 0.45, 0, Math.PI * 2);
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
  <g stroke="white" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- Bridge deck (main roadway) -->
    <line x1="${size * 0.12}" y1="${size * 0.66}" x2="${size * 0.88}" y2="${size * 0.66}" stroke-width="${size * 0.047}" />
    <!-- Bridge deck support -->
    <line x1="${size * 0.12}" y1="${size * 0.69}" x2="${size * 0.88}" y2="${size * 0.69}" stroke-width="${size * 0.023}" />
    
    <!-- Left tower -->
    <line x1="${size * 0.25}" y1="${size * 0.69}" x2="${size * 0.25}" y2="${size * 0.23}" stroke-width="${size * 0.055}" />
    <!-- Right tower -->
    <line x1="${size * 0.75}" y1="${size * 0.69}" x2="${size * 0.75}" y2="${size * 0.23}" stroke-width="${size * 0.055}" />
    
    <!-- Tower tops -->
    <line x1="${size * 0.22}" y1="${size * 0.23}" x2="${size * 0.28}" y2="${size * 0.23}" stroke-width="${size * 0.031}" />
    <line x1="${size * 0.72}" y1="${size * 0.23}" x2="${size * 0.78}" y2="${size * 0.23}" stroke-width="${size * 0.031}" />
    
    <!-- Main suspension cable -->
    <path d="M ${size * 0.25} ${size * 0.27} Q ${size * 0.5} ${size * 0.48} ${size * 0.75} ${size * 0.27}" stroke-width="${size * 0.023}" />
    
    <!-- Vertical suspension cables -->
    <line x1="${size * 0.33}" y1="${size * 0.35}" x2="${size * 0.33}" y2="${size * 0.66}" stroke-width="${size * 0.016}" />
    <line x1="${size * 0.41}" y1="${size * 0.42}" x2="${size * 0.41}" y2="${size * 0.66}" stroke-width="${size * 0.016}" />
    <line x1="${size * 0.5}" y1="${size * 0.46}" x2="${size * 0.5}" y2="${size * 0.66}" stroke-width="${size * 0.016}" />
    <line x1="${size * 0.59}" y1="${size * 0.42}" x2="${size * 0.59}" y2="${size * 0.66}" stroke-width="${size * 0.016}" />
    <line x1="${size * 0.67}" y1="${size * 0.35}" x2="${size * 0.67}" y2="${size * 0.66}" stroke-width="${size * 0.016}" />
    
    <!-- Side anchor cables -->
    <line x1="${size * 0.12}" y1="${size * 0.66}" x2="${size * 0.25}" y2="${size * 0.27}" stroke-width="${size * 0.016}" />
    <line x1="${size * 0.88}" y1="${size * 0.66}" x2="${size * 0.75}" y2="${size * 0.27}" stroke-width="${size * 0.016}" />
  </g>
  ${statusDot ? `
  <circle cx="${size * 0.8}" cy="${size * 0.8}" r="${size * 0.18}" fill="black" />
  <circle cx="${size * 0.8}" cy="${size * 0.8}" r="${size * 0.135}" fill="${statusDot}" />
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
