#!/usr/bin/env python3
"""Compare real WEB/native screenshots. Requires Pillow; never invents a native capture."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance


def normalize(path, insets, width):
    image = Image.open(path).convert("RGB")
    top, right, bottom, left = insets
    if min(insets) < 0 or left + right >= image.width or top + bottom >= image.height:
        raise ValueError("Insets must remove only the recorded system/browser chrome")
    image = image.crop((left, top, image.width - right, image.height - bottom))
    scale = width / image.width
    return image.resize((width, round(image.height * scale)), Image.Resampling.LANCZOS)


def compare(web, native, threshold=8):
    if web.size != native.size:
        raise ValueError(f"Content viewports differ: WEB {web.size}, native {native.size}. "
                         "Recapture at matching logical content height; do not stretch or silently crop.")
    difference = ImageChops.difference(web, native)
    pixels = list(difference.getdata())
    changed = sum(max(pixel) > threshold for pixel in pixels)
    mae = sum(sum(pixel) for pixel in pixels) / (len(pixels) * 3)
    return difference, {"size": list(web.size), "changedPixels": changed,
                        "totalPixels": len(pixels), "changedRatio": changed / len(pixels),
                        "meanAbsoluteChannelError": mae, "channelTolerance": threshold}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("web", type=Path)
    parser.add_argument("native", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=390, help="Logical content width")
    parser.add_argument("--web-insets", nargs=4, type=int, default=[0, 0, 0, 0], metavar=("TOP", "RIGHT", "BOTTOM", "LEFT"))
    parser.add_argument("--native-insets", nargs=4, type=int, default=[0, 0, 0, 0], help="Physical pixels: top right bottom left; system bars only")
    parser.add_argument("--region", nargs=4, type=int, metavar=("X", "Y", "W", "H"), help="Optional explicitly recorded matching logical region")
    parser.add_argument("--channel-tolerance", type=int, default=8)
    parser.add_argument("--max-changed-ratio", type=float, default=0.01)
    args = parser.parse_args()
    if args.width <= 0 or not 0 <= args.channel_tolerance <= 255 or not 0 <= args.max_changed_ratio <= 1:
        parser.error("Invalid width/tolerance")
    web = normalize(args.web, args.web_insets, args.width)
    native = normalize(args.native, args.native_insets, args.width)
    if args.region:
        x, y, w, h = args.region
        if min(x, y) < 0 or min(w, h) <= 0 or any(x + w > i.width or y + h > i.height for i in [web, native]):
            parser.error("Region must exist in BOTH captures")
        web, native = [image.crop((x, y, x + w, y + h)) for image in [web, native]]
    difference, metrics = compare(web, native, args.channel_tolerance)
    args.output.mkdir(parents=True, exist_ok=True)
    web.save(args.output / "web-normalized.png")
    native.save(args.output / "native-normalized.png")
    ImageEnhance.Contrast(difference).enhance(3).save(args.output / "diff.png")
    Image.blend(web, native, 0.5).save(args.output / "overlay.png")
    passed = metrics["changedRatio"] <= args.max_changed_ratio
    report = {"web": str(args.web.resolve()), "native": str(args.native.resolve()),
              "webInsets": args.web_insets, "nativeInsets": args.native_insets,
              "region": args.region, "metrics": metrics, "passed": passed,
              "maxChangedRatio": args.max_changed_ratio,
              "note": "Pixel metric needs human review; no masks, no registration shifts, no height stretching."}
    (args.output / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
