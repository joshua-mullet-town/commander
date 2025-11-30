/**
 * Playwright test to reproduce the "stuck pieces" bug
 *
 * Test scenario:
 * Round 1: Move Blue P1 left by 2 spaces
 * Round 2: Move Blue P1 down (toward Red back wall) by 8 spaces
 * Expected bug: Red P5 intercepts but appears stuck with P4 visually
 */

import { test, expect } from '@playwright/test';

test('reproduce stuck pieces bug - Red P5 invisible intercept', async ({ page }) => {
  // Navigate to game
  await page.goto('http://localhost:3456');

  console.log('🎮 Starting game...');

  // Create new game (human vs AI)
  await page.click('button:has-text("Create New Game")');

  // Wait for game to be in "playing" state
  await page.waitForSelector('.round-info', { timeout: 10000 });

  console.log('✅ Game started');

  // Enable auto-diagnostics
  await page.evaluate(() => {
    (window as any).enableAutoDiagnostics();
  });

  console.log('🔧 Auto-diagnostics enabled');

  // ROUND 1: Move Blue P1 left by 2
  console.log('\n🔵 ROUND 1: Moving Blue P1 LEFT by 2');

  // Click on Blue P1 (should be at 7,8 initially)
  await page.click('#cell-7-8 .piece[data-player="A"][data-piece-id="1"]');

  // Set direction to LEFT
  await page.selectOption('select#move-direction', 'left');

  // Set distance to 2
  await page.fill('input#move-distance', '2');

  // Queue the move
  await page.click('button:has-text("Queue Move")');

  console.log('✅ Queued: Blue P1 LEFT 2');

  // Wait for Round 2 to start
  await page.waitForFunction(() => {
    const gameState = (window as any).__GAME_STATE__;
    return gameState && gameState.round === 2;
  }, { timeout: 15000 });

  console.log('\n📊 Round 2 started');

  // Get Blue P1's current position after Round 1
  const blueP1PosAfterR1 = await page.evaluate(() => {
    const gameState = (window as any).__GAME_STATE__;
    const p1 = gameState.players.A.pieces.find((p: any) => p.id === 1);
    return { x: p1.x, y: p1.y };
  });

  console.log(`🔵 Blue P1 now at (${blueP1PosAfterR1.x}, ${blueP1PosAfterR1.y})`);

  // ROUND 2: Move Blue P1 DOWN by 8 (toward Red back wall at y=0)
  console.log('\n🔵 ROUND 2: Moving Blue P1 DOWN by 8 (toward Red back wall)');

  // Click on Blue P1 at its new position
  await page.click(`#cell-${blueP1PosAfterR1.x}-${blueP1PosAfterR1.y} .piece[data-player="A"][data-piece-id="1"]`);

  // Set direction to DOWN
  await page.selectOption('select#move-direction', 'down');

  // Set distance to 8
  await page.fill('input#move-distance', '8');

  // Queue the move
  await page.click('button:has-text("Queue Move")');

  console.log('✅ Queued: Blue P1 DOWN 8');

  // Wait for Round 3 to start (so Round 2 completes)
  await page.waitForFunction(() => {
    const gameState = (window as any).__GAME_STATE__;
    return gameState && gameState.round === 3;
  }, { timeout: 15000 });

  console.log('\n📊 Round 3 started - Round 2 completed');

  // Run diagnostic to capture the bug
  console.log('\n🔍 Running diagnostic...\n');

  const diagnostic = await page.evaluate(() => {
    const gameState = (window as any).__GAME_STATE__;

    const results = {
      round: gameState.round,
      blueP1Backend: null as any,
      blueP1DOM: null as any,
      redP5Backend: null as any,
      redP5DOM: null as any,
      redP4Backend: null as any,
      redP4DOM: null as any,
    };

    // Blue P1 - where backend says it is
    const blueP1 = gameState.players.A.pieces.find((p: any) => p.id === 1);
    results.blueP1Backend = { x: blueP1.x, y: blueP1.y, alive: blueP1.alive };

    // Blue P1 - where it actually is in DOM
    const blueP1Element = document.querySelector('.piece[data-player="A"][data-piece-id="1"]');
    if (blueP1Element) {
      const parentCell = blueP1Element.closest('.cell');
      results.blueP1DOM = parentCell?.id || 'NOT FOUND';
    }

    // Red P5 - where backend says it is
    const redP5 = gameState.players.B.pieces.find((p: any) => p.id === 5);
    results.redP5Backend = { x: redP5.x, y: redP5.y, alive: redP5.alive };

    // Red P5 - where it actually is in DOM
    const redP5Element = document.querySelector('.piece[data-player="B"][data-piece-id="5"]');
    if (redP5Element) {
      const parentCell = redP5Element.closest('.cell');
      results.redP5DOM = parentCell?.id || 'NOT FOUND';
    }

    // Red P4 - where backend says it is
    const redP4 = gameState.players.B.pieces.find((p: any) => p.id === 4);
    results.redP4Backend = { x: redP4.x, y: redP4.y, alive: redP4.alive };

    // Red P4 - where it actually is in DOM
    const redP4Element = document.querySelector('.piece[data-player="B"][data-piece-id="4"]');
    if (redP4Element) {
      const parentCell = redP4Element.closest('.cell');
      results.redP4DOM = parentCell?.id || 'NOT FOUND';
    }

    return results;
  });

  console.log('\n📊 DIAGNOSTIC RESULTS:');
  console.log('='.repeat(60));
  console.log(`Round: ${diagnostic.round}`);
  console.log('\n🔵 BLUE P1:');
  console.log(`  Backend: (${diagnostic.blueP1Backend.x}, ${diagnostic.blueP1Backend.y}) alive: ${diagnostic.blueP1Backend.alive}`);
  console.log(`  DOM:     ${diagnostic.blueP1DOM}`);
  console.log(`  Match:   ${diagnostic.blueP1DOM === `cell-${diagnostic.blueP1Backend.x}-${diagnostic.blueP1Backend.y}` ? '✅' : '❌'}`);

  console.log('\n🔴 RED P4:');
  console.log(`  Backend: (${diagnostic.redP4Backend.x}, ${diagnostic.redP4Backend.y}) alive: ${diagnostic.redP4Backend.alive}`);
  console.log(`  DOM:     ${diagnostic.redP4DOM}`);
  console.log(`  Match:   ${diagnostic.redP4DOM === `cell-${diagnostic.redP4Backend.x}-${diagnostic.redP4Backend.y}` ? '✅' : '❌'}`);

  console.log('\n🔴 RED P5:');
  console.log(`  Backend: (${diagnostic.redP5Backend.x}, ${diagnostic.redP5Backend.y}) alive: ${diagnostic.redP5Backend.alive}`);
  console.log(`  DOM:     ${diagnostic.redP5DOM}`);
  console.log(`  Match:   ${diagnostic.redP5DOM === `cell-${diagnostic.redP5Backend.x}-${diagnostic.redP5Backend.y}` ? '✅' : '❌'}`);

  console.log('\n🐛 BUG CHECK:');
  if (diagnostic.redP5DOM === diagnostic.redP4DOM) {
    console.log(`  ❌ RED P5 and P4 ARE BOTH IN THE SAME DOM CELL: ${diagnostic.redP5DOM}`);
    console.log(`  ❌ But backend says P5 is at (${diagnostic.redP5Backend.x}, ${diagnostic.redP5Backend.y})`);
    console.log(`  ❌ And backend says P4 is at (${diagnostic.redP4Backend.x}, ${diagnostic.redP4Backend.y})`);
  } else {
    console.log(`  ✅ P4 and P5 are in different cells (no visual bug detected)`);
  }

  console.log('='.repeat(60));

  // Take screenshot for visual confirmation
  await page.screenshot({ path: '/Users/joshuamullet/code/commander/bug-screenshot.png', fullPage: true });
  console.log('\n📸 Screenshot saved to: bug-screenshot.png');

  // Assertions
  const expectedBlueP1Cell = `cell-${diagnostic.blueP1Backend.x}-${diagnostic.blueP1Backend.y}`;
  const expectedRedP5Cell = `cell-${diagnostic.redP5Backend.x}-${diagnostic.redP5Backend.y}`;

  expect(diagnostic.blueP1DOM).toBe(expectedBlueP1Cell);
  expect(diagnostic.redP5DOM).toBe(expectedRedP5Cell);
  expect(diagnostic.redP5DOM).not.toBe(diagnostic.redP4DOM);
});
