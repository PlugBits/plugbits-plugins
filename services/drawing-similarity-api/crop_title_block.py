#!/usr/bin/env python3
"""Crop PNG to bottom-right area (title block) for OCR."""
import sys
import os
from PIL import Image


def main():
    if len(sys.argv) < 3:
        print('Usage: crop_title_block.py <input.png> <output.png>', file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    bottom_frac = float(os.environ.get('OCR_CROP_BOTTOM_FRAC', '0.38'))
    right_frac = float(os.environ.get('OCR_CROP_RIGHT_FRAC', '0.55'))

    img = Image.open(input_path)
    w, h = img.size
    left = int(w * (1.0 - right_frac))
    top = int(h * (1.0 - bottom_frac))
    cropped = img.crop((left, top, w, h))
    cropped.save(output_path, format='PNG')


if __name__ == '__main__':
    main()
