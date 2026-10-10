import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseSignoffs } from '../scripts/check-release-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pending = JSON.parse(readFileSync(path.join(root, 'scripts/reviews/review-signoffs.json'), 'utf8'));
assert(validateReleaseSignoffs(pending).length > 0, 'pending human reviews block release readiness');

const approved = structuredClone(pending);
for (const row of approved.screenReaders) Object.assign(row, {
  status: 'approved', reviewer: 'Test reviewer', date: '2026-10-09', evidence: 'review-record:test',
});
for (const row of approved.nativeSpeakers) Object.assign(row, {
  status: 'approved', reviewer: 'Test reviewer', date: '2026-10-09', evidence: 'review-record:test',
});
Object.assign(approved.stormSafety, {
  status: 'approved', reviewer: 'Qualified reviewer', qualification: 'test qualification',
  date: '2026-10-09', evidence: 'review-record:test',
});
assert.deepEqual(validateReleaseSignoffs(approved), [], 'complete, attributable sign-offs pass the readiness gate');
const duplicateReviewer = structuredClone(approved);
duplicateReviewer.screenReaders.push({ ...duplicateReviewer.screenReaders[0] });
assert(validateReleaseSignoffs(duplicateReviewer).some((failure) => failure.includes('screen-reader.talkback: duplicate')),
  'duplicate screen-reader records cannot be silently overwritten');
const invalidDate = structuredClone(approved);
invalidDate.stormSafety.date = '2026-99-99';
assert(validateReleaseSignoffs(invalidDate).some((failure) => failure.includes('valid ISO review date')),
  'a syntactically shaped but impossible calendar date is rejected');
const missingCollection = structuredClone(approved);
delete missingCollection.nativeSpeakers;
assert(validateReleaseSignoffs(missingCollection).some((failure) => failure.includes('native-speaker: expected an array')),
  'a missing review collection is an explicit gate failure');
approved.nativeSpeakers.pop();
assert(validateReleaseSignoffs(approved).some((failure) => failure.includes('native-speaker.tr')),
  'a missing locale sign-off blocks release readiness');
console.log('release review gate blocks missing human sign-offs and accepts a complete fixture');
