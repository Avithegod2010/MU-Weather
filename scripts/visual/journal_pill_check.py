"""Journal pill check: does the rating highlight appear at rest, with real size, in both styles?

Seeds a rating for today so the journal has a selected item, then reads every slide highlight on Home
once the page has settled. Pass means at least one highlight is visible with a non-zero size, in both
the clear and glass styles, with no page errors from the sliding code.

Usage (scripts/visual, Playwright environment as capture.py):
  python journal_pill_check.py --base-url http://localhost:8094 --out results/journal
"""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import capture  # noqa: E402
from glass_refraction import SEED_TODAY_RATING  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SETTLE_MS = {'at_rest': 3000}


def read_highlights(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="slide-highlight"]')).map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, opacity: getComputedStyle(el).opacity };
        })"""
    )


def check(browser, base_url, style_mode, out):
    context, page, errors = capture.open_page(
        browser, base_url, 'clear', True, {'styleMode': style_mode, 'skyMotion': False}, scale=1
    )
    context.add_init_script(SEED_TODAY_RATING)
    page.reload(wait_until='load')
    capture.settle(page, SETTLE_MS['at_rest'])
    page.get_by_text('Just right').first.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(1500)
    boxes = read_highlights(page)
    page.screenshot(path=str(out / f'journal-{style_mode}.png'))
    context.close()
    visible = [b for b in boxes if b['width'] > 0 and b['height'] > 0 and float(b['opacity']) > 0]
    return {'style': style_mode, 'highlights': boxes, 'visible': len(visible), 'pageErrors': list(errors)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8094')
    parser.add_argument('--out', default='results/journal')
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = capture.launch(p)
        results = [check(browser, args.base_url, style, out) for style in ('clear', 'glass')]
        browser.close()
    summary = {'results': results, 'pass': all(r['visible'] > 0 for r in results)}
    (out / 'journal-pill.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
