#!/usr/bin/env python3
"""Crop PNG to title block area for OCR.

Mode 1 (fraction): crop_title_block.py <input.png> <output.png>
Mode 2 (coords):   crop_title_block.py <input.png> <output.png> <x> <y> <w> <h> [padding]
"""
import sys
import os
from PIL import Image


def main():
    if len(sys.argv) < 3:
        print('Usage: crop_title_block.py <input.png> <output.png> [x y w h [padding]]', file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    img = Image.open(input_path)
    iw, ih = img.size

    if len(sys.argv) >= 7:
        # Coordinate mode: x y w h [padding]
        x = int(sys.argv[3])
        y = int(sys.argv[4])
        bw = int(sys.argv[5])
        bh = int(sys.argv[6])
        padding = int(sys.argv[7]) if len(sys.argv) > 7 else 30
        left = max(0, x - padding)
        top = max(0, y - padding)
        right = min(iw, x + bw + padding)
        bottom = min(ih, y + bh + padding)
    else:
        # Fraction mode
        bottom_frac = float(os.environ.get('OCR_CROP_BOTTOM_FRAC', '0.22'))
        right_frac = float(os.environ.get('OCR_CROP_RIGHT_FRAC', '0.32'))
        left = int(iw * (1.0 - right_frac))
        top = int(ih * (1.0 - bottom_frac))
        right = iw
        bottom = ih

    img.crop((left, top, right, bottom)).save(output_path, format='PNG')


if __name__ == '__main__':
    main()
