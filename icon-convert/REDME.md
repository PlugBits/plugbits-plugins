# PNG → WEBP 変換ツール

PNG画像を **512×512 の WEBP** に変換する簡易ツールです。  
**比率維持・中央配置・透過維持** で、アイコン用途を想定しています。

---

## フォルダ構成

icon-convert/
├─ .venv/
├─ convert.py
├─ input/
└─ output/
input/ に変換したい PNG を入れます
output/ に WEBP が出力されます

初回セットアップ
1. 作業フォルダに移動
cd icon-convert

2. 仮想環境を作成
python3 -m venv .venv

3. 仮想環境を有効化
source .venv/bin/activate
有効化されると、ターミナルの先頭に (.venv) が表示されます。

4. 必要ライブラリをインストール
python -m pip install --upgrade pip
python -m pip install pillow

使い方
1. input/ に PNG を入れる
例:
input/
├─ icon1.png
├─ icon2.png
└─ icon3.png

2. スクリプトを実行
python convert.py

3. output/ に WEBP が出力される
例:
output/
├─ icon1.webp
├─ icon2.webp
└─ icon3.webp
仕様
入力形式: .png
出力形式: .webp
出力サイズ: 512x512
縦横比: 維持
配置: 中央
背景: 透過維持
出力名: 元ファイル名そのまま（拡張子のみ .webp）
毎回の使い方
2回目以降は以下だけでOKです。
cd icon-convert
source .venv/bin/activate
python convert.py
作業終了後に仮想環境を抜ける場合:
deactivate

よくあるエラー
input フォルダに PNG ファイルがありません。
input/ の中に PNG を入れてください
ModuleNotFoundError: No module named 'PIL'
Pillow が入っていません。以下を実行してください
source .venv/bin/activate
python -m pip install pillow
command not found: python
仮想環境が有効になっていない可能性があります
source .venv/bin/activate
補足
このツールは、元画像を無理に引き伸ばさず、
縦横比を維持したまま 512×512 の枠内に収めて中央配置 します。
そのため、縦長・横長の画像は余白付きで出力されます。
アイコン用途で潰れを防ぎたい場合に向いています。