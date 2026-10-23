// Versioning helpers for MU Weather release tooling. The app version lives in
// app.json; this module exists so release scripts, CI and documentation can
// import a single source of truth without parsing the JSON themselves.
const VERSION = '1.4.0';

module.exports = { version: VERSION };
