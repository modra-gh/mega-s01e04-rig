#!/usr/bin/env node

import { realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [outputArg, baseUrlArg = 'http://127.0.0.1:8787'] = process.argv.slice(2);

if (!outputArg || process.argv.length > 4) {
  console.error('Usage: node scripts/export-digest.mjs <output.html> [local-base-url]');
  process.exit(2);
}

const outputPath = path.resolve(outputArg);
const outputParent = await realpath(path.dirname(outputPath));
const resolvedOutput = path.join(outputParent, path.basename(outputPath));
const relativeOutput = path.relative(repoRoot, resolvedOutput);
if (relativeOutput === '' || (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== '..' && !path.isAbsolute(relativeOutput))) {
  console.error('Output must be outside the repository.');
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(baseUrlArg);
} catch {
  console.error(`Invalid base URL: ${baseUrlArg}`);
  process.exit(2);
}

if (!['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) || !['http:', 'https:'].includes(baseUrl.protocol)) {
  console.error('The rig base URL must point to localhost, 127.0.0.1, or ::1.');
  process.exit(2);
}

const digestUrl = new URL('/digest/2026-10-28', baseUrl);
let response;
try {
  response = await fetch(digestUrl);
} catch (error) {
  console.error(`Could not fetch ${digestUrl}: ${error.message}`);
  process.exit(1);
}
if (!response.ok) {
  console.error(`Rig returned HTTP ${response.status} for ${digestUrl}.`);
  process.exit(1);
}

const contentType = response.headers.get('content-type') ?? '';
if (!contentType.toLowerCase().includes('text/html')) {
  console.error(`Expected text/html from ${digestUrl}, received ${contentType || '(no content type)'}.`);
  process.exit(1);
}

const html = await response.text();
if (!html.includes('<h1>digest · 2026-10-28</h1>') || !html.includes('<!doctype html>') || !html.includes('</html>')) {
  console.error(`Response from ${digestUrl} is not the expected self-contained digest page.`);
  process.exit(1);
}

await writeFile(resolvedOutput, html, { encoding: 'utf8', flag: 'wx' });
console.log(`Saved ${digestUrl} to ${resolvedOutput}`);
