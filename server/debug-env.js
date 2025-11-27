#!/usr/bin/env node

console.log('🔍 DEBUG: Environment variables that might affect tsx:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('NODE_OPTIONS:', process.env.NODE_OPTIONS);
console.log('TSX_TSCONFIG_PATH:', process.env.TSX_TSCONFIG_PATH);

// Check for any environment variables that might contain arrays or objects
console.log('\n🔍 Checking all environment variables for non-string values:');
for (const [key, value] of Object.entries(process.env)) {
  if (key.includes('NODE') || key.includes('TS') || key.includes('TSX')) {
    console.log(`${key} (type: ${typeof value}):`, value);
  }
}

console.log('\n✅ Environment check complete\n');
