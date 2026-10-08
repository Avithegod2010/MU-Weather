"""
Measures the Home hero text halo from pixels, which the contrast audit cannot do.

For each sample (weather condition x day/night x Home background), three screenshots are taken:
  A  normal rendering (text and halo)
  B  text colour transparent, halo kept    -> the background the glyphs really sit on
  C  text colour transparent, halo removed -> the bare sky (no halo)
Glyph pixels are where A differs from B. For those pixels the ink colour is composited over the
background (B, or C without the halo) and the WCAG ratio is taken. The 5th percentile is reported:
that is the worst contrast over the glyph pixels, ignoring the very worst 5%.

  python3 scripts/visual/halo_audit.py --base-url http://localhost:8085 --out scripts/visual/results/halo-audit.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402

import capture  # noqa: E402

CONDITIONS = [('clear', True), ('clear', False), ('rain', True), ('thunder', False), ('fog', True)]
BACKGROUNDS = ['dynamic', 'aurora', 'sunset', 'ocean', 'forest', 'midnight']
GLYPH_DIFF = 60  # summed RGB difference that counts as glyph ink

# Leaf text inside the hero: from the location line down to the feels-like line.
HERO_TARGETS_JS = """() => {
  const all = Array.from(document.querySelectorAll('div,span'));
  // Leaves are elements with no element children; a Text may hold several text nodes.
  const leaves = all.filter(e => e.childElementCount === 0 && e.textContent.trim());
  const onScreen = e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.height > 0; };
  // The hero location line sits below the header (which holds a second 'London') and the alerts banner.
  const loc = leaves.find(e => e.textContent.trim() === 'London' && onScreen(e) && e.getBoundingClientRect().top >= 120);
  const feels = leaves.find(e => /^Feels like/i.test(e.textContent.trim()) && onScreen(e));
  if (!loc || !feels) return [];
  const top = loc.getBoundingClientRect().top - 4;
  const bottom = feels.getBoundingClientRect().bottom + 4;
  return leaves
    .filter(e => { const r = e.getBoundingClientRect(); return r.top >= top && r.bottom <= bottom && onScreen(e); })
    .map(e => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color: cs.color, size: parseFloat(cs.fontSize) };
    });
}"""


def luminance(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    hi = np.maximum(la, lb)
    lo = np.minimum(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def parse_rgba(text):
    values = [float(v) for v in text.replace('rgba(', '').replace('rgb(', '').replace(')', '').split(',')]
    alpha = values[3] if len(values) == 4 else 1.0
    return np.array(values[:3]), alpha


def measure(a_path, b_path, c_path, target):
    a = np.asarray(Image.open(a_path).convert('RGB')).astype(float)
    b = np.asarray(Image.open(b_path).convert('RGB')).astype(float)
    c = np.asarray(Image.open(c_path).convert('RGB')).astype(float)
    x0, y0 = int(target['x']), int(target['y'])
    x1, y1 = int(target['x'] + target['w']), int(target['y'] + target['h'])
    sl = (slice(max(y0, 0), y1), slice(max(x0, 0), x1))
    diff = np.abs(a[sl] - b[sl]).sum(axis=2)
    mask = diff > GLYPH_DIFF
    if mask.sum() < 5:
        return None
    ink, alpha = parse_rgba(target['color'])
    out = {}
    for name, bg_image in (('halo', b), ('noHalo', c)):
        bg = bg_image[sl][mask]
        composed = ink * alpha + bg * (1 - alpha)  # ink as it is drawn over this background
        values = ratio(composed, bg)
        out[name] = round(float(np.percentile(values, 5)), 2)
    return out


def run(args):
    out_dir = Path(args.out).parent / 'halo-shots'
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as p:
        browser = capture.launch(p)
        for condition, is_day in CONDITIONS:
            for background in BACKGROUNDS:
                overrides = {'homeBackground': background, 'colorTheme': 'default'}
                context, page, errors = capture.open_page(
                    browser, args.base_url, condition, is_day, settings_overrides=overrides)
                capture.settle(page, 4000)
                targets = page.evaluate(HERO_TARGETS_JS)
                tag = f"{condition}-{'day' if is_day else 'night'}-{background}"
                a_path = out_dir / f'{tag}-A.png'
                b_path = out_dir / f'{tag}-B.png'
                c_path = out_dir / f'{tag}-C.png'
                page.screenshot(path=str(a_path))
                page.add_style_tag(content='* { color: transparent !important; }')
                page.wait_for_timeout(200)
                page.screenshot(path=str(b_path))
                page.add_style_tag(content='* { text-shadow: none !important; }')
                page.wait_for_timeout(200)
                page.screenshot(path=str(c_path))
                for target in targets:
                    measured = measure(a_path, b_path, c_path, target)
                    if measured is None:
                        continue
                    results.append({'config': tag, 'text': target['text'], 'size': target['size'], **measured})
                context.close()
        browser.close()

    # Keep the three screenshots of each sample out of git: only the numbers are committed.
    summary = {}
    for row in results:
        summary.setdefault(row['config'], []).append(row)
    worst_halo = min((row['halo'] for row in results), default=None)
    worst_nohalo = min((row['noHalo'] for row in results), default=None)
    report = {
        'samples': len(summary),
        'targets': len(results),
        'worstHalo': worst_halo,
        'worstNoHalo': worst_nohalo,
        'rows': results,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8085')
    parser.add_argument('--out', default='scripts/visual/results/halo-audit.json')
    run(parser.parse_args())
