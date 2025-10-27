
# SPEC (short) — Excel-like Conditional Formatting (Prototype)

## Summary
Kintone上で **見た目のみ** を変更する条件付き書式エンジンをJS単体で試作。  
設定画面は未実装。サンプルルールを内蔵し、一覧/詳細/新規/編集すべてに適用。

## Core
- ルール: `type`(number/text/date/empty) + `op` + `value` + `effect`
- 効果: 背景/文字色/枠線/バッジ/行ハイライト（一覧）
- **style直書き禁止** → `classList.add`（CSSはスコープ化: `puchi-*`）
- 一覧: `kintone.app.getFieldElements` を利用。行ハイライトは `tr` へクラス付与。
- 詳細/編集/新規: `kintone.app.record.getFieldElement` を利用。
- テーマ/実行ボタン: ヘッダに .kb-root を配置。

## Operators
- Number: `= != > >= < <= between notBetween`
- Text: `contains notContains = != regex`
- Date: `today yesterday tomorrow past future withinDays olderThanDays`
- Empty: `isEmpty isNotEmpty`

## Notes
- 値取得はプロト版のため **可視テキスト/record.value** を併用。
- 競合・更新は行わない（見た目のみ）。
- バッジは一つだけ追加（重複防止）。
