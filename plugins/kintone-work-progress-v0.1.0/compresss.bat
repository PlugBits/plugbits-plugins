@echo off
cd /d "%~dp0"

for %%a in (*.mp4) do (
  echo 圧縮中: %%a
  ffmpeg -i "%%a" -vcodec libx265 -crf 32 -preset slow -vf scale=640:-1 -b:a 64k -r 24 "compressed_%%~na.mp4"
)
echo 完了しました！
pause