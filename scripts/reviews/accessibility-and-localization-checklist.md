# Accessibility and native-speaker review checklist

**Status: human review pending.** The checks below describe the review to perform; they are not evidence that TalkBack, VoiceOver, a native speaker, or a storm-safety specialist has reviewed this build. The locale audit only checks catalog keys and placeholder parity, not translation quality or accessibility.

## Screen-reader pass

Run on a physical Android device with TalkBack and an iPhone/iPad with VoiceOver. Record OS/app versions, language, text-size setting, reviewer, date, and any defects. Test both a normal forecast and stale/offline provider data.

- [ ] **Official warning card:** focus each warning. The spoken label starts with its localized level (green/yellow/orange/red), then event, description, instruction, affected area, and expiry where present. The source and source-update time are available. Severity is not communicated by color alone.
- [ ] **Warning edge cases:** check one warning, multiple warnings, a warning without an expiry, and no active warning. Confirm that the card's absent/loading/error states are not announced as an active warning.
- [ ] **Provider-status card:** focus every row and confirm it announces the source name plus fresh/stale/loading/unavailable/check-failed state and age when available. Color dots add no information that is missing from the spoken label.
- [ ] **Alert history:** each row is one reachable, non-interactive text group. Verify scheduled-by-app (not proof the OS displayed it), quiet-hours suppression, missing permission, scheduling failure, escalation, and expired labels; legacy rows must say that their outcome was not recorded. Confirm message, evidence, city, time, and severity context are understandable.
- [ ] **Controls:** verify the clear-history action, alert toggles, quiet-hour steppers, custom-rule controls, and storm-feedback buttons have unique labels, correct button/switch roles, and announced selected/checked state. No decorative icon should take focus.
- [ ] **Navigation and scale:** focus order follows visual order; there are no trapped or skipped controls, duplicate row announcements, clipped labels at large text sizes, or touch targets that are difficult to activate.
- [ ] **Contrast and motion:** inspect warning text and controls in both themes and at high contrast / reduced-motion settings where available. Color must not be the only severity/status cue.

## Native-speaker pass

A fluent native reviewer should read the full UI in context, not just this table. Review the new strings for hourly-versus-daily rain probability, forecast exposure versus observed conditions, forecast-calibration statistics, recommendation feedback, warning severity, provider-check failures, and notification outcomes. Check placeholder order and grammar, common weather terminology, units, date/time conventions, and whether status wording distinguishes an app scheduling attempt from confirmed OS display. Report language issues even if the automated locale audit passes.

| Locale | Native reviewer | Date | Result / issue references |
| --- | --- | --- | --- |
| English (`en`) | Pending | Pending | Pending |
| Hindi (`hi`) | Pending | Pending | Pending |
| Bengali (`bn`) | Pending | Pending | Pending |
| Spanish (`es`) | Pending | Pending | Pending |
| French (`fr`) | Pending | Pending | Pending |
| German (`de`) | Pending | Pending | Pending |
| Dutch (`nl`) | Pending | Pending | Pending |
| Greek (`el`) | Pending | Pending | Pending |
| Hungarian (`hu`) | Pending | Pending | Pending |
| Indonesian (`id`) | Pending | Pending | Pending |
| Italian (`it`) | Pending | Pending | Pending |
| Portuguese (`pt`) | Pending | Pending | Pending |
| Polish (`pl`) | Pending | Pending | Pending |
| Turkish (`tr`) | Pending | Pending | Pending |

## Storm-safety wording review

- [ ] A qualified severe-weather/storm-safety reviewer checks the storm, lightning, hail, wind, and official-warning action text against the intended geography and severity.
- [ ] Reviewer name/qualification, date, locale, and approved changes are recorded. An automated locale test or this checklist does not satisfy this review.

**Overall sign-off: pending.** Do not describe translation quality, assistive-technology behavior, or storm-safety wording as human-reviewed until the table and review record are completed.

## Release gate

Before a release tag or publication, record each completed review in `scripts/reviews/review-signoffs.json` with status `approved`, reviewer, ISO date, and an evidence reference. The storm-safety entry also requires the reviewer's qualification. Run `npm run release:gate`; the `Release review gate` GitHub workflow also runs on `v*` tags and can be called by a release workflow. It intentionally fails while any required sign-off remains pending. Configure repository release rules/required checks to require the `Human review sign-offs` job; a tag-triggered workflow cannot prevent a separate publishing path that ignores its result. Do not replace human sign-offs with the static JSX audit or locale-key/placeholder audit.
