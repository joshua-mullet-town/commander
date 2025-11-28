/**
 * Game Constants
 * Shared constants used across all game modules
 */

// Starting positions for all pieces
export const STARTING_POSITIONS = {
  A: [
    { id: 1, x: 4, y: 8 },
    { id: 2, x: 5, y: 8 },
    { id: 3, x: 6, y: 8 }
  ],
  B: [
    { id: 1, x: 4, y: 2 },
    { id: 2, x: 5, y: 2 },
    { id: 3, x: 6, y: 2 }
  ]
} as const;

// Flag spawn positions
export const FLAG_POSITIONS = {
  A: { x: 5, y: 10 }, // Blue flag - center back of blue territory
  B: { x: 5, y: 0 }   // Red flag - center back of red territory
} as const;

// Territory boundaries (y-coordinates)
export const TERRITORY = {
  A: { min: 6, max: 10 },  // Blue territory: rows 6-10
  B: { min: 0, max: 4 }     // Red territory: rows 0-4
} as const;

// No-guard zone boundaries
export const NO_GUARD_ZONES = {
  A: { minX: 4, maxX: 6, minY: 9, maxY: 10 }, // Blue no-guard zone
  B: { minX: 4, maxX: 6, minY: 0, maxY: 1 }   // Red no-guard zone
} as const;

// Rescue key positions
export const KEY_POSITIONS = {
  A: { x: 9, y: 1 }, // Blue team's key in RED territory (top-right)
  B: { x: 1, y: 9 }  // Red team's key in BLUE territory (bottom-left)
} as const;
