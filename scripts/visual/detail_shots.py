"""
Screenshots of the views the Home harness (`capture.py shots`) does not reach:
the converted charts on Home, the day detail, and the storm ring and flash.

  python3 scripts/visual/detail_shots.py --base-url http://localhost:8084 --out scripts/visual/results/detail

Needs Playwright and a Chromium (CHROMIUM_PATH). Output is committed under scripts/visual/results/.
Each step is best effort: a missing label is reported and skipped, not treated as a crash.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402

import capture  # noqa: E402


def visible_text(page, text):
    # Loose match, then the first element that is actually on screen (duplicates can be hidden).
    matches = page.get_by_text(text)
    for index in range(min(matches.count(), 6)):
        candidate = matches.nth(index)
        if candidate.is_visible():
            return candidate
    return matches.first


def shoot(page, out, name, report):
    path = out / f'{name}.png'
    page.screenshot(path=str(path))
    report['shots'].append(str(path))
    print('wrote', path)


def scroll_to(page, text, report):
    loc = visible_text(page, text)
    try:
        # Centre the element, so the screenshot shows the control and what is around it.
        loc.evaluate("e => e.scrollIntoView({block: 'center', inline: 'nearest'})")
        page.wait_for_timeout(1200)
        return True
    except Exception as error:  # noqa: BLE001 - report and continue
        report['missing'].append(f'{text}: {str(error)[:120]}')
        return False


def tap(page, text, report):
    try:
        visible_text(page, text).click(timeout=4000)
        page.wait_for_timeout(1200)
        return True
    except Exception as error:  # noqa: BLE001
        report['missing'].append(f'tap {text}: {str(error)[:120]}')
        return False


def run(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = {'shots': [], 'missing': []}
    with sync_playwright() as p:
        browser = capture.launch(p)
        overrides = json.loads(args.settings) if args.settings else None
        context, page, errors = capture.open_page(
            browser, args.base_url, args.condition, not args.night, settings_overrides=overrides)
        capture.settle(page, 5000)

        # Liquid Glass: the sliding highlight in the comfort journal (Cold / Just right / Hot).
        if scroll_to(page, 'Just right', report):
            shoot(page, out, 'glass-slider-rest', report)
            if tap(page, 'Hot', report):
                page.wait_for_timeout(600)
                shoot(page, out, 'glass-slider-moved', report)

        # Sun and moon: the sun arc card and the moon phase gauge.
        if scroll_to(page, 'Sun & Twilight', report):
            shoot(page, out, 'sun-twilight-card', report)

        # Home: the converted charts.
        for label, name in [
            ('Rain Probability', 'home-rain-probability'),
            ('Hourly Forecast', 'home-hourly-forecast'),
            ('48-Hour Trend', 'home-trend'),
            ('Moon', 'home-moon'),
        ]:
            if scroll_to(page, label, report):
                shoot(page, out, name, report)

        # Day detail: the 24-hour temperature curve and rain bars.
        scroll_to(page, 'Tomorrow', report)
        if tap(page, 'Tomorrow', report):
            shoot(page, out, 'day-detail-top', report)
            if scroll_to(page, 'Temperature · next 24 hours', report):
                shoot(page, out, 'day-detail-temperature', report)

        context.close()

        # Storm ring runs on a fresh page so it starts from Home, not the day detail.
        context, page, storm_errors = capture.open_page(browser, args.base_url, args.condition, not args.night)
        capture.settle(page, 5000)
        if scroll_to(page, 'Storm Distance', report):
            if tap(page, 'I saw a flash', report):
                page.wait_for_timeout(400)
                shoot(page, out, 'storm-counting-start', report)
                page.wait_for_timeout(2500)
                shoot(page, out, 'storm-counting-mid', report)
                tap(page, 'Heard thunder', report)
                shoot(page, out, 'storm-result', report)

        report['pageErrors'] = errors + storm_errors
        (out / 'report.json').write_text(json.dumps(report, indent=2))
        browser.close()
    print(f"{len(report['shots'])} screenshots; {len(report['missing'])} steps skipped")
    for item in report['missing']:
        print('  skipped:', item)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8084')
    parser.add_argument('--out', default='scripts/visual/results/detail')
    parser.add_argument('--condition', default='clear', help='fixture weather: clear, rain, thunder, ...')
    parser.add_argument('--night', action='store_true')
    parser.add_argument('--settings', default='', help='JSON settings overrides, e.g. {"styleMode":"glass"}')
    run(parser.parse_args())
