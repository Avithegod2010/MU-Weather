"""Liquid-glass refraction probe: is the sky behind the sliding pill really refracted?

Three 2x close-ups of the highlight pill, all on the journal with a rating seeded for today and sky
motion off, so the sky is still:
  1. snapshot   - the glass refracts the real sky snapshot (the shipped look)
  2. snapshot2  - the same again, to measure noise (rendering and resampling)
  3. fallback   - the gradient approximation (window.__MU_DISABLE_SKY_BACKDROP = true)

The script reports the mean absolute pixel difference between snapshot and fallback, and between the two
snapshot captures. If the snapshot differs from the fallback well beyond the noise, the backdrop is doing
something the gradient does not. Results go to results/glass/refraction.json.

Usage (scripts/visual, with the Playwright environment from capture.py and Pillow):
  python glass_refraction.py --base-url http://localhost:8092 --out results/glass
"""
import argparse
import io
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import capture  # noqa: E402  (offline routing and browser launch)
from playwright.sync_api import sync_playwright  # noqa: E402
from PIL import Image, ImageChops, ImageStat  # noqa: E402

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

FALLBACK_FLAG = "window.__MU_DISABLE_SKY_BACKDROP = true;"


def visible_highlight(page):
    """The slide highlight that is on screen and has a size, or None."""
    highlights = page.locator('[data-testid="slide-highlight"]')
    for index in range(highlights.count()):
        candidate = highlights.nth(index)
        box = candidate.bounding_box()
        if box and box['width'] > 0 and box['height'] > 0 and 0 <= box['y'] < 844:
            return candidate
    return None


def capture_pill(browser, base_url, path, fallback):
    """Opens Home in glass style, scrolls the journal into view and returns the pill's PNG bytes."""
    context, page, _errors = capture.open_page(
        browser, base_url, 'clear', True, {'styleMode': 'glass', 'skyMotion': False}, scale=2
    )
    context.add_init_script(SEED_TODAY_RATING)
    if fallback:
        context.add_init_script(FALLBACK_FLAG)
    page.reload(wait_until='load')
    capture.settle(page, 5000)
    page.get_by_text('Just right').first.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(2000)
    pill = visible_highlight(page)
    png = None
    if pill is not None:
        png = pill.screenshot()
        pathlib.Path(path).write_bytes(png)
    errors = list(_errors)
    context.close()
    return png, errors


def mean_difference(a_png, b_png):
    """Mean absolute difference per channel, 0 to 255, over the pill crop."""
    a = Image.open(io.BytesIO(a_png)).convert('RGB')
    b = Image.open(io.BytesIO(b_png)).convert('RGB')
    if a.size != b.size:
        b = b.resize(a.size)
    diff = ImageChops.difference(a, b)
    return round(sum(ImageStat.Stat(diff).mean) / 3, 2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8092')
    parser.add_argument('--out', default='results/glass')
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    result = {'shots': {}, 'pageErrors': []}
    with sync_playwright() as p:
        browser = capture.launch(p)
        snapshot, errors = capture_pill(browser, args.base_url, out / 'refraction-snapshot.png', fallback=False)
        snapshot2, _ = capture_pill(browser, args.base_url, out / 'refraction-snapshot2.png', fallback=False)
        fallback, _ = capture_pill(browser, args.base_url, out / 'refraction-fallback.png', fallback=True)
        browser.close()
    result['pageErrors'] = errors
    if not (snapshot and snapshot2 and fallback):
        result['error'] = 'no visible slide highlight in one of the captures'
    else:
        result['shots'] = {
            'snapshot': str(out / 'refraction-snapshot.png'),
            'fallback': str(out / 'refraction-fallback.png'),
        }
        result['meanDifference'] = {
            'snapshotVsFallback': mean_difference(snapshot, fallback),
            'snapshotVsSnapshot2 (noise)': mean_difference(snapshot, snapshot2),
        }
    (out / 'refraction.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
