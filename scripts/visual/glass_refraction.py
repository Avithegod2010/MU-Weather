"""Liquid-glass refraction probe: a close-up of the sliding highlight in glass style.

Loads Home in glass style, scrolls the weather journal ("Just right") into view and saves a
2x crop of the visible highlight pill, at rest and after moving it to "Hot". The crops let a
reviewer check whether the sky behind the pill is refracted (shifted and tinted) or flat.

Usage (from scripts/visual, with the Playwright environment from capture.py):
  python glass_refraction.py --base-url http://localhost:8091 --out results/glass
"""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import capture  # noqa: E402  (offline routing and browser launch)
from playwright.sync_api import sync_playwright  # noqa: E402


SEED_TODAY_RATING = """
try {
  const d = new Date();
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (!localStorage.getItem('__glass_probe_seeded')) {
    localStorage.setItem('@mu_weather/comfort_journal_v1', JSON.stringify([
      { date: key, rating: 'ok', tMax: 19, tMin: 9, tApparent: 13, humidity: 60, wind: 10, at: Date.now() },
    ]));
    localStorage.setItem('__glass_probe_seeded', '1');
  }
} catch (e) {}
"""


def visible_highlight(page):
    """The slide highlight that is on screen and has a size, or None."""
    highlights = page.locator('[data-testid="slide-highlight"]')
    for index in range(highlights.count()):
        candidate = highlights.nth(index)
        box = candidate.bounding_box()
        if box and box['width'] > 0 and box['height'] > 0 and 0 <= box['y'] < 844:
            return candidate
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8091')
    parser.add_argument('--out', default='results/glass')
    parser.add_argument('--condition', default='clear')
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    result = {'shots': [], 'pageErrors': []}
    with sync_playwright() as p:
        browser = capture.launch(p)
        context, page, errors = capture.open_page(
            browser, args.base_url, args.condition, True, {'styleMode': 'glass'}, scale=2
        )
        page.on('pageerror', lambda e: result['pageErrors'].append(str(e)[:300]))
        # The journal highlight only exists once today has a rating, so seed one before the app loads.
        context.add_init_script(SEED_TODAY_RATING)
        page.reload(wait_until='load')
        capture.settle(page, 5000)
        page.get_by_text('Just right').first.evaluate("e => e.scrollIntoView({block: 'center'})")
        page.wait_for_timeout(1500)
        pill = visible_highlight(page)
        if pill is None:
            result['error'] = 'no visible slide highlight'
        else:
            rest = out / 'refraction-pill-rest.png'
            pill.screenshot(path=str(rest))
            result['shots'].append(str(rest))
            hot = page.get_by_text('Hot').first
            hot.click(timeout=4000)
            page.wait_for_timeout(1400)
            pill = visible_highlight(page)
            if pill is not None:
                moved = out / 'refraction-pill-moved.png'
                pill.screenshot(path=str(moved))
                result['shots'].append(str(moved))
        context.close()
        browser.close()
    (out / 'refraction.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
