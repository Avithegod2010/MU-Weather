#!/usr/bin/env python3
"""Visual checks for the web build of MU Weather.

What it does:
  * Serves the weather APIs from fixtures (fixtures.py), so every run sees the same data.
  * Seeds a saved location and settings in localStorage (AsyncStorage on web).
  * Captures screenshots per sky condition / theme / background, or measures frame times.

Requirements (not installed by the app):
  pip install playwright && python -m playwright install chromium
  or point CHROMIUM_PATH at an existing Chromium binary.

Examples:
  python3 scripts/visual/capture.py shots --base-url http://localhost:8081 --out visual-out/shots
  python3 scripts/visual/capture.py frames --base-url http://localhost:8081 --label after --out visual-out/frames-after.json

Frame times from headless Chromium are a relative signal only. They are not a substitute
for a trace on a mid-range Android device.
"""
import argparse
import json
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fixtures  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

LOCATION_KEY = '@mu_weather/last_location_v1'
SETTINGS_KEY = '@mu_weather/settings_v1'

# Rain and snow are the particle conditions; thunder adds lightning and clouds.
SKY_SCENARIOS = [
    ('clear-day', 'clear', True),
    ('clear-night', 'clear', False),
    ('cloudy-day', 'cloudy', True),
    ('fog-day', 'fog', True),
    ('rain-night', 'rain', False),
    ('snow-day', 'snow', True),
    ('thunder-night', 'thunder', False),
]

THEMES = ['default', 'white', 'skyblue', 'midnight', 'forest', 'lavender', 'sunset', 'sepia', 'amoled', 'materialyou']
BACKGROUNDS = ['dynamic', 'aurora', 'sunset', 'ocean', 'forest', 'midnight']


def launch(p, uncapped=False):
    executable = os.environ.get('CHROMIUM_PATH')
    args = ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader']
    if uncapped:
        # Without this, headless rAF locks to 60 fps and hides how much work each frame costs.
        args += ['--disable-gpu-vsync', '--disable-frame-rate-limit']
    if os.environ.get('CHROMIUM_NO_ZYGOTE'):
        args += ['--no-zygote']
    return p.chromium.launch(executable_path=executable or None, args=args, headless=True)


def open_page(browser, base_url, condition, is_day, settings_overrides=None, viewport=(390, 844), scale=1):
    context = browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, device_scale_factor=scale)
    settings = {'skyMotion': True, **(settings_overrides or {})}
    # Guarded: some frames (about:blank, sandboxed iframes) deny localStorage access.
    seed = (
        "try { localStorage.setItem(%r, %r); localStorage.setItem(%r, %r); } catch (e) {}"
        % (LOCATION_KEY, json.dumps(fixtures.location()), SETTINGS_KEY, json.dumps(settings))
    )
    context.add_init_script(seed)
    forecast = json.dumps(fixtures.forecast(condition, is_day))
    aqi = json.dumps(fixtures.air_quality())

    def route(r):
        url = r.request.url
        if 'api.open-meteo.com/v1/forecast' in url:
            r.fulfill(status=200, content_type='application/json', body=forecast)
        elif 'air-quality-api.open-meteo.com' in url:
            r.fulfill(status=200, content_type='application/json', body=aqi)
        elif url.startswith(base_url):
            r.continue_()
        else:
            # Everything else is offline in the harness: fail fast instead of hanging.
            r.abort()

    context.route('**/*', route)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)[:300]))
    page.goto(base_url, wait_until='load', timeout=60000)
    return context, page, errors


def settle(page, ms=5000):
    page.wait_for_timeout(ms)


def cmd_shots(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {'shots': [], 'pageErrors': {}}
    with sync_playwright() as p:
        browser = launch(p)
        try:
            for name, condition, is_day in SKY_SCENARIOS:
                context, page, errors = open_page(browser, args.base_url, condition, is_day)
                settle(page, args.settle)
                shot = out / f'sky-{name}.png'
                page.screenshot(path=str(shot))
                report['shots'].append(str(shot))
                report['pageErrors'][name] = errors
                context.close()
            # Theme × background grid for the contrast review, on a bright and a dark sky.
            for sky_name, condition, is_day in [('bright', 'clear', True), ('dark', 'clear', False)]:
                for theme in THEMES:
                    context, page, errors = open_page(browser, args.base_url, condition, is_day, {'colorTheme': theme})
                    settle(page, args.settle)
                    shot = out / f'theme-{sky_name}-{theme}.png'
                    page.screenshot(path=str(shot))
                    report['shots'].append(str(shot))
                    context.close()
                for background in BACKGROUNDS:
                    context, page, errors = open_page(browser, args.base_url, condition, is_day, {'homeBackground': background})
                    settle(page, args.settle)
                    shot = out / f'background-{sky_name}-{background}.png'
                    page.screenshot(path=str(shot))
                    report['shots'].append(str(shot))
                    context.close()
        finally:
            browser.close()
    (out / 'report.json').write_text(json.dumps(report, indent=2))
    print(f'wrote {len(report["shots"])} screenshots to {out}')


FRAME_JS = """
(durationMs) => new Promise((resolve) => {
  const deltas = [];
  let last = null;
  const start = performance.now();
  function tick(now) {
    if (last !== null) deltas.push(now - last);
    last = now;
    if (now - start < durationMs) requestAnimationFrame(tick);
    else resolve(deltas);
  }
  requestAnimationFrame(tick);
})
"""


def summarise(deltas):
    if not deltas:
        return {'frames': 0}
    ordered = sorted(deltas)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    return {
        'frames': len(deltas),
        'meanMs': round(statistics.mean(deltas), 2),
        'medianMs': round(statistics.median(deltas), 2),
        'p95Ms': round(p95, 2),
        'maxMs': round(max(deltas), 2),
        'over33ms': sum(1 for d in deltas if d > 33.4),
        'fpsApprox': round(1000 / statistics.mean(deltas), 1),
    }


def cmd_frames(args):
    results = {}
    with sync_playwright() as p:
        browser = launch(p, uncapped=True)
        try:
            for name, condition, is_day in SKY_SCENARIOS:
                # Each scenario gets a fresh page so the sky starts from the same state.
                context, page, errors = open_page(browser, args.base_url, condition, is_day)
                settle(page, args.settle)
                deltas = page.evaluate(FRAME_JS, args.duration * 1000)
                counts = page.evaluate(
                    "() => ({ domNodes: document.querySelectorAll('*').length,"
                    " svgNodes: document.querySelectorAll('svg').length,"
                    " canvasNodes: document.querySelectorAll('canvas').length })"
                )
                results[name] = {**summarise(deltas), **counts, 'pageErrors': len(errors)}
                context.close()
        finally:
            browser.close()
    report = {'label': args.label, 'durationSeconds': args.duration, 'scenarios': results}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    shots = sub.add_parser('shots')
    shots.add_argument('--base-url', default='http://localhost:8081')
    shots.add_argument('--out', default='visual-out/shots')
    shots.add_argument('--settle', type=int, default=5000, help='ms to wait before each capture')
    shots.set_defaults(func=cmd_shots)
    frames = sub.add_parser('frames')
    frames.add_argument('--base-url', default='http://localhost:8081')
    frames.add_argument('--label', required=True)
    frames.add_argument('--out', required=True)
    frames.add_argument('--duration', type=int, default=6, help='seconds of frame sampling per scenario')
    frames.add_argument('--settle', type=int, default=4000)
    frames.set_defaults(func=cmd_frames)
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
