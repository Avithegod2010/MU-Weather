"""Liquid-glass check: loads Home in glass style and records the page errors and a screenshot.

Usage: python glass_check.py --base-url http://localhost:8088 --out results/glass
Needs the Playwright venv used by capture.py. Output goes next to the other probe results.
"""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import capture  # noqa: E402  (reuses the offline routing and the browser launch)
from playwright.sync_api import sync_playwright  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8088')
    parser.add_argument('--out', default='results/glass')
    parser.add_argument('--condition', default='clear')
    parser.add_argument('--settle', type=int, default=4000)
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = capture.launch(p)
        context, page, errors = capture.open_page(
            browser, args.base_url, args.condition, True, {'styleMode': 'glass'}
        )
        capture.settle(page, args.settle)
        shot = out / f'home-glass-{args.condition}.png'
        page.screenshot(path=str(shot))
        # Pills are the sliding highlights; a backdrop-shader pill is not distinguishable in the DOM,
        # so the count of highlight nodes confirms the glass branch mounted at all.
        highlights = page.locator('[data-testid="slide-highlight"]').count()
        result = {
            'screenshot': str(shot),
            'slideHighlights': highlights,
            'pageErrors': errors,
        }
        (out / 'glass-check.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
        context.close()
        browser.close()


if __name__ == '__main__':
    main()
