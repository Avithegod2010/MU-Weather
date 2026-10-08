"""
Frame-time summary from Android `dumpsys gfxinfo <package> framestats` output.

On a device (mid-range Android, release build, sky motion on):
  adb shell dumpsys gfxinfo <package> reset
  ... use the Home screen for 30 s ...
  adb shell dumpsys gfxinfo <package> framestats > framestats-<label>.txt

Then:
  python3 scripts/visual/parse_gfxinfo.py framestats-before.txt framestats-after.txt --out scripts/visual/results/android-gfxinfo.json

Frame time = FrameCompleted - IntendedVsync (both in ns). A frame is janky when it takes longer
than one 60 Hz vsync interval past its deadline (16.7 ms). Only the rows of the framestats CSV are read.
"""
import argparse
import json
import statistics
from pathlib import Path

VSYNC_MS = 1000 / 60


def read_frames(path: Path):
    lines = path.read_text().splitlines()
    header_index = next(i for i, line in enumerate(lines) if line.startswith('Flags,'))
    header = lines[header_index].split(',')
    intended = header.index('IntendedVsync')
    completed = header.index('FrameCompleted')
    frames = []
    for line in lines[header_index + 1:]:
        parts = line.split(',')
        if len(parts) <= completed or not parts[completed].strip().isdigit():
            # Blank or trailing summary rows.
            continue
        start = int(parts[intended])
        end = int(parts[completed])
        if end <= start:
            continue
        frames.append((end - start) / 1e6)  # ms
    return frames


def percentile(values, pct):
    ordered = sorted(values)
    if not ordered:
        return None
    index = min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1)))
    return ordered[index]


def summarise(frames):
    return {
        'frames': len(frames),
        'meanMs': round(statistics.fmean(frames), 2) if frames else None,
        'medianMs': round(statistics.median(frames), 2) if frames else None,
        'p95Ms': round(percentile(frames, 95), 2) if frames else None,
        'maxMs': round(max(frames), 2) if frames else None,
        'jankyFrames': sum(1 for ms in frames if ms > VSYNC_MS),
        'jankPercent': round(100 * sum(1 for ms in frames if ms > VSYNC_MS) / len(frames), 1) if frames else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    report = {}
    for path in args.files:
        report[path.stem] = summarise(read_frames(path))
    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + '\n')


if __name__ == '__main__':
    main()
