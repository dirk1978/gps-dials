// Draws the app icon, so it can be regenerated when the name and branding are settled.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

const size = 1024;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#121725';
ctx.beginPath();
ctx.roundRect(40, 40, size - 80, size - 80, 200);
ctx.fill();

const cx = size / 2;
const cy = size / 2 + 20;
const r = 310;
const start = Math.PI * 0.75;
const sweep = Math.PI * 1.5;

ctx.lineWidth = 62;
ctx.lineCap = 'round';
ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
ctx.beginPath();
ctx.arc(cx, cy, r, start, start + sweep);
ctx.stroke();

const gradient = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
gradient.addColorStop(0, '#ff9a3d');
gradient.addColorStop(1, '#ff3d7f');
ctx.strokeStyle = gradient;
ctx.beginPath();
ctx.arc(cx, cy, r, start, start + sweep * 0.72);
ctx.stroke();

const needle = start + sweep * 0.72;
ctx.strokeStyle = '#ffffff';
ctx.lineWidth = 34;
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.lineTo(cx + Math.cos(needle) * 230, cy + Math.sin(needle) * 230);
ctx.stroke();

ctx.fillStyle = '#ffffff';
ctx.beginPath();
ctx.arc(cx, cy, 52, 0, Math.PI * 2);
ctx.fill();

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', canvas.toBuffer('image/png'));
