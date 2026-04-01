
# kintone サムネビュー レイアウト仕様（Codex向け）
**目的**:  
- 詳細画面の**スペース**に描画するサムネビューで、
  - **縦方向は内側スクロール**を発生させず、**ページ全体のスクロール**に任せる
  - **横方向**は指定モードに応じて列数を制御  
    - `auto` の場合は**最大幅でできる限り多列**（レスポンシブ）  
    - `2col` / `3col` 指定時は**固定列数**でレスポンシブ維持
  - **レスポンシブ**対応（モバイルは崩れない）

---

## 1. 前提
- フィールドコード: `GALLERY`（kintone スペース）
- 描画ターゲット: `#space_GALLERY`（スペースDOM）内に `.pb-grid` を作成してサムネを並べる
- 既存のサムネ描画ロジックはそのまま利用し、**レイアウトのみ本仕様に置換**

---

## 2. 共通方針（縦方向の内側スクロール禁止）
- スペース自身と祖先要素の `height / max-height / overflow` を**解除**
- サムネコンテナは `height:auto; overflow:visible;` とし、**ページ全体スクロール**で閲覧

### 実装（detail.show 初期化時）
```js
kintone.events.on('app.record.detail.show', () => {
  const CODE = 'GALLERY';
  const sp = kintone.app.record.getSpaceElement(CODE);
  if (!sp || sp.dataset.pbLayoutReady) return;
  sp.dataset.pbLayoutReady = '1';

  // スペース幅・高さの制約解除
  Object.assign(sp.style, {
    width: '100%', maxWidth: 'none',
    height: 'auto', maxHeight: 'none',
    overflow: 'visible'
  });

  // 祖先の高さ/overflow制約を解除（あるものだけ）
  const ancestors = [
    sp.parentElement,
    sp.closest('.control-value-gaia'),
    sp.closest('.value-outer-gaia'),
    sp.closest('.subtable-row-gaia'),
    document.querySelector('.record-gaia .box-right-gaia')
  ].filter(Boolean);
  for (const el of ancestors) {
    Object.assign(el.style, { height:'auto', maxHeight:'none', overflow:'visible' });
  }

  // スタイル注入（以下の「3. 横方向レイアウトCSS」参照）
  injectPbLayoutCSS(CODE);
});

function injectPbLayoutCSS(code){
  if (document.getElementById('pb-layout-style')) return;
  const style = document.createElement('style');
  style.id = 'pb-layout-style';
  style.textContent = `
    /* 共通：内側スクロール無効化 */
    #space_${code} { width:100% !important; max-width:none !important; overflow:visible !important; }
    #space_${code} * { max-height:none !important; }

    /* 共通：カード見た目 */
    #space_${code} .pb-item{
      display:flex; gap:10px; align-items:center;
      border:1px solid #e8edf3; border-radius:10px; padding:10px; background:#fff;
    }
    #space_${code} .pb-thumb{ width:96px; height:96px; object-fit:cover; border-radius:8px; flex:0 0 auto; }
    #space_${code} .pb-note{ font-size:13px; color:#263238; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #space_${code} .pb-time{ font-size:11px; color:#78909c; margin-top:4px; }
  `;
  document.head.appendChild(style);
}
```

---

## 3. 横方向レイアウトCSS（モード別）
`layoutMode` によって `.pb-grid` のグリッド定義を切替。

### 3.1 auto（最大幅で可変列, レスポンシブ）
- コンテナは画面幅いっぱいに広げる（スペース/親の max-width は解除済み）
- `repeat(auto-fit, minmax(320px,1fr))` で**できる限り多列**  
  - 小さい画面では自動的に1列や2列に縮む
```css
#space_GALLERY .pb-grid.auto {
  display:grid; gap:12px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
@media (max-width: 480px){
  #space_GALLERY .pb-thumb{ width:80px; height:80px; } /* 端末幅に応じて微調整 */
}
```

### 3.2 2col（常に2列を基本に, ただし極小幅では1列）
```css
#space_GALLERY .pb-grid.two {
  display:grid; gap:12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (max-width: 640px){
  #space_GALLERY .pb-grid.two {
    grid-template-columns: 1fr;
  }
}
```

### 3.3 3col（常に3列を基本に, 極小幅では1〜2列へ）
```css
#space_GALLERY .pb-grid.three {
  display:grid; gap:12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 900px){
  #space_GALLERY .pb-grid.three { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 640px){
  #space_GALLERY .pb-grid.three { grid-template-columns: 1fr; }
}
```

> 備考: 既存フォームの左右カラム構造で**実質の横幅が狭い**場合は、`.record-gaia .box-right-gaia` の `max-width` が効くことがあります。必要に応じて `max-width:none` を与えるか、描画位置を右カラム先頭/全幅側へ移すことを検討。

---

## 4. レイアウトモード切替コード（JS）
- プラグイン設定 or クエリで `layoutMode` を受け取り、`.pb-grid` にクラス付与

```js
function mountGalleryGrid(spaceCode, layoutMode='auto'){
  const sp = kintone.app.record.getSpaceElement(spaceCode);
  if (!sp) return;
  const grid = document.createElement('div');
  grid.className = `pb-grid ${clsFromMode(layoutMode)}`;
  sp.appendChild(grid);
  return grid;
}
function clsFromMode(mode){
  if (mode === '2col' || mode === 'two')  return 'two';
  if (mode === '3col' || mode === 'three')return 'three';
  return 'auto';
}
```

---

## 5. レスポンシブ最適化チェックリスト
1. **最小カード幅**は 300–340px が目安（本文1行＋サムネ96pxなら 320px が快適）  
2. 画像は `object-fit: cover` + 固定サイズ or `aspect-ratio` で崩れ防止  
3. `.pb-grid` の `gap` は 10–16px 程度、カード内 `padding` は 8–12px  
4. **初期表示は最新10件＋「もっと見る」**で縦長抑制（体感速度UP）  
5. モバイルで列数が窮屈なら、`@media` で `thumb` を 80px に落とす  
6. 祖先の `max-width`／`overflow` が勝っていないか都度確認（上の解除ロジックで対応）

---

## 6. 受け入れ基準（Acceptance）
- [ ] サムネビューは**内側スクロールが発生しない**（ページ全体がスクロール）
- [ ] `auto` モードで**可能な限り多列**になり、狭い画面では自動的に列数が減る
- [ ] `2col` モードで**常時2列**（600–640px未満では1列）
- [ ] `3col` モードで**常時3列**（900px未満→2列、640px未満→1列）
- [ ] モバイル幅でも崩れず、サムネ・メモは可読
- [ ] 展開ビュー（フル拡大）は現行仕様のまま動作

---

## 7. 差し込み例（全体ひな形）
```js
kintone.events.on('app.record.detail.show', async () => {
  const CODE = 'GALLERY';
  const MODE = 'auto'; // 'auto' | '2col' | '3col'

  // 縦方向スクロール解除＋共通CSS
  const sp = kintone.app.record.getSpaceElement(CODE);
  if (!sp || sp.dataset.pbReady) return;
  sp.dataset.pbReady = '1';
  Object.assign(sp.style, { width:'100%', maxWidth:'none', height:'auto', maxHeight:'none', overflow:'visible' });
  ['.control-value-gaia','.value-outer-gaia','.subtable-row-gaia'].forEach(sel=>{
    const el = sp.closest(sel); if (el) Object.assign(el.style, { height:'auto', maxHeight:'none', overflow:'visible' });
  });
  const right = document.querySelector('.record-gaia .box-right-gaia');
  if (right) Object.assign(right.style, { maxWidth:'none' });

  injectPbLayoutCSS(CODE);

  // グリッド作成 & データ描画
  const grid = document.createElement('div');
  grid.className = `pb-grid ${clsFromMode(MODE)}`;
  sp.appendChild(grid);

  // ここで rows を取得してカードをappend（略）
  // rows.forEach(r => grid.appendChild(makeCard(r)) );
});
```
