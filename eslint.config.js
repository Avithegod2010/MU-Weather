// Expo's lint rules (React, React Native, import hygiene). Run with `npm run lint`.
//
// The React Compiler-era hook rules (refs, set-state-in-effect, purity, immutability,
// static-components) flag the animation patterns this app uses on purpose: reading and writing
// ref values during render for worklets, and setting state from effects after layout. They are
// kept as warnings, so they stay visible, and do not fail the lint. Real hook-order errors remain
// errors. See DECISIONS.md, section 7.
const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**', '.expo/**'],
  },
  {
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
]);
