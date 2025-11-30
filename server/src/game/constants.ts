/**
 * Game Constants
 * Shared constants used across all game modules
 */

// Board dimensions
export const BOARD_WIDTH = 19;  // 19 columns (wide board)
export const BOARD_HEIGHT = 13; // 13 rows (expanded from 11)
export const PIECES_PER_TEAM = 7; // 7 pieces per team (expanded from 5)

// Starting positions for all pieces (centered on 19-wide board)
// Center column is x=9 (0-indexed, so 0-18 range, middle is 9)
export const STARTING_POSITIONS = {
  A: [
    { id: 1, x: 6, y: 10 },  // Leftmost
    { id: 2, x: 7, y: 10 },  // Left
    { id: 3, x: 8, y: 10 },  // Left-center
    { id: 4, x: 9, y: 10 },  // Center
    { id: 5, x: 10, y: 10 }, // Right-center
    { id: 6, x: 11, y: 10 }, // Right
    { id: 7, x: 12, y: 10 }  // Rightmost
  ],
  B: [
    { id: 1, x: 6, y: 2 },  // Leftmost
    { id: 2, x: 7, y: 2 },  // Left
    { id: 3, x: 8, y: 2 },  // Left-center
    { id: 4, x: 9, y: 2 },  // Center
    { id: 5, x: 10, y: 2 }, // Right-center
    { id: 6, x: 11, y: 2 }, // Right
    { id: 7, x: 12, y: 2 }  // Rightmost
  ]
} as const;

// Flag spawn positions (centered on 19-wide board)
export const FLAG_POSITIONS = {
  A: { x: 9, y: 12 }, // Blue flag - center top row
  B: { x: 9, y: 0 }   // Red flag - center bottom row
} as const;

// Territory boundaries (y-coordinates - adjusted for 13-row board)
export const TERRITORY = {
  A: { min: 8, max: 12 },  // Blue territory: rows 8-12 (5 rows)
  B: { min: 0, max: 4 }    // Red territory: rows 0-4 (5 rows)
} as const;

// No-guard zone boundaries (7 pieces need 7-wide zone)
export const NO_GUARD_ZONES = {
  A: { minX: 6, maxX: 12, minY: 11, maxY: 12 }, // Blue no-guard zone (7 wide, 2 tall)
  B: { minX: 6, maxX: 12, minY: 0, maxY: 1 }    // Red no-guard zone (7 wide, 2 tall)
} as const;

// Rescue key positions (corners of the wider board)
export const KEY_POSITIONS = {
  A: { x: 17, y: 1 },  // Blue team's key in RED territory (top-right corner)
  B: { x: 1, y: 11 }   // Red team's key in BLUE territory (bottom-left corner)
} as const;
