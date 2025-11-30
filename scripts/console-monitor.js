#!/usr/bin/env node

/**
 * Console Monitor - Captures browser console logs in real-time
 *
 * Run: node scripts/console-monitor.js
 *
 * This will open a browser window and stream ALL console logs to your terminal.
 */

import { chromium } from 'playwright';

(async () => {
  console.log('🎧 Starting Console Monitor...\n');

  const browser = await chromium.launch({
    headless: false,  // Keep browser visible
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null  // Use full screen
  });

  const page = await context.newPage();

  // Capture console.log, console.warn, console.error, etc.
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();

    // Color-code by type
    const colors = {
      log: '\x1b[36m',      // Cyan
      info: '\x1b[34m',     // Blue
      warn: '\x1b[33m',     // Yellow
      error: '\x1b[31m',    // Red
      debug: '\x1b[35m',    // Magenta
    };

    const color = colors[type] || '\x1b[37m';
    const reset = '\x1b[0m';

    console.log(`${color}[${type.toUpperCase()}]${reset} ${text}`);

    // Show source location for errors
    if (type === 'error' && location.url) {
      console.log(`  └─ ${location.url}:${location.lineNumber}`);
    }
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', error => {
    console.log('\x1b[31m[EXCEPTION]\x1b[0m', error.message);
    console.log(error.stack);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    console.log('\x1b[31m[NETWORK FAILED]\x1b[0m', request.url());
  });

  console.log('🌐 Opening http://localhost:3456...\n');
  console.log('📡 Console logs will appear below:\n');
  console.log('─'.repeat(60));

  await page.goto('http://localhost:3456');

  console.log('─'.repeat(60));
  console.log('\n✅ Monitoring active! Leave this terminal open to see logs.');
  console.log('   Press Ctrl+C to stop.\n');

  // Keep alive
  await new Promise(() => {});
})();
