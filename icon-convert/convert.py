from pathlib import Path
from PIL import Image

INPUT_DIR = Path("input")
OUTPUT_DIR = Path("output")
TARGET_SIZE = (512, 512)
QUALITY = 95

OUTPUT_DIR.mkdir(exist_ok=True)

def convert_png_to_webp(src_path: Path, dst_path: Path):
    with Image.open(src_path) as img:
        img = img.convert("RGBA")

        # 元画像の比率を維持したまま 512x512 内に収める
        resized = img.copy()
        resized.thumbnail(TARGET_SIZE, Image.LANCZOS)

        # 透過背景の512x512キャンバスを作成
        canvas = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))

        # 中央配置
        x = (TARGET_SIZE[0] - resized.width) // 2
        y = (TARGET_SIZE[1] - resized.height) // 2
        canvas.paste(resized, (x, y), resized)

        # WEBP保存
        canvas.save(
            dst_path,
            "WEBP",
            quality=QUALITY,
            method=6
        )

def main():
    png_files = list(INPUT_DIR.glob("*.png"))

    if not png_files:
        print("input フォルダに PNG ファイルがありません。")
        return

    for src_path in png_files:
        dst_path = OUTPUT_DIR / f"{src_path.stem}.webp"
        convert_png_to_webp(src_path, dst_path)
        print(f"Converted: {src_path.name} -> {dst_path.name}")

    print("完了しました。")

if __name__ == "__main__":
    main()