# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest release line receives security fixes. If you are running an
older build, please update to the newest release first:
https://github.com/Avithegod2010/MU-Weather/releases

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately through GitHub:

1. Open the repository's **Security** tab:
   https://github.com/Avithegod2010/MU-Weather/security
2. Click **"Report a vulnerability"** (private vulnerability reporting).
3. Include: a description of the issue, steps to reproduce, the affected
   version/APK, and the potential impact.

You can expect an acknowledgement within **7 days**. If the report is
confirmed, a fix will be prepared and a security advisory published before
the details are made public. Reporters are credited in the advisory unless
they prefer to remain anonymous.

## Scope Notes

- MU Weather is a **client-side Android app**. All user data (settings,
  favorites, forecast logs) stays on the device in local storage — there is
  no MU Weather server or account system.
- Weather data is fetched from public APIs (Open-Meteo, NOAA, MeteoAlarm)
  over HTTPS.
- In scope: the app code in this repository, its data handling on device,
  and the CI/release pipeline.
- Out of scope: vulnerabilities in third-party services themselves
  (report those to the respective provider). Dependency vulnerabilities in
  this repo are tracked automatically via Dependabot.

## Automated Security Measures in This Repository

- **Dependabot alerts + security updates** for dependency vulnerabilities
- **CodeQL** static analysis on every push and pull request
- **Branch protection** on `master` (linear history required)
- **TypeScript typecheck CI** gate on every push and pull request
