# 一覧日付スライダー / Index Date Range Slider

- **Version**: 1.0.19  
- **Type**: App plugin

## Overview
Adds a two-handle date range slider and preset buttons to the list view so users can narrow records by a chosen DATE/DATETIME field. The UI uses CSS variables for styling and works in both Japanese and English environments.

## Features
- 2-handle range slider in the list header with draggable handles and visual active range.
- Preset buttons (Today, Last 7, Last 30, This Month, This Year, etc.) localised for JA/EN.
- Apply and Reset buttons update or clear the list view query in place.
- Date inputs stay in sync with the slider handles.
- Automatically estimates available min/max dates; falls back to preset ranges if the API is unavailable.

## Settings
| UI label (JA / EN) | Description | Key | Type | Default |
|---|---|---|---|---|
| 対象日付フィールド / Date field | DATE/DATETIME field used for filtering | `dateField` | `string` (field code) | `""` (must be selected) |
| 週の開始 / Week start | Controls weekday order and presets such as This Week | `weekStart` | `string` (`"0"` = Sun, `"1"` = Mon) | `"0"` |
| プリセット / Presets | Stored preset keys available to users | `presets` | `string` (JSON array) | `["all","today","yesterday","last-7","last-30","this-week","last-week","this-month","last-month","this-quarter","last-quarter","this-half","last-half","this-year","last-year"]` |
| 既定プリセット / Default preset | Preset applied on initial load or Reset | `defaultPreset` | `string` | `"last-30"` |
| 適用ビュー / Target views | View IDs that should display the slider (empty = all) | `targetViews` | `string` (JSON array) | `[]` |

- Settings are persisted with `kintone.plugin.app.setConfig`.

## Kintone Events
- `app.record.index.show` (list runtime UI)
- `app.plugin.app.setting.show` / `DOMContentLoaded` fallback for the config page

## File Layout
```
plugin/
├─ manifest.json
├─ dist/
│  ├─ css/
│  ├─ html/
│  ├─ images/
│  └─ js/
├─ src/
│  ├─ css/
│  ├─ html/
│  └─ js/
└─ app/   # unminified runtime bundle
```

## Implementation Notes
- Targets ES2019; no external libraries are required.
- Avoids `eval`, `new Function`, and long-running `setTimeout`.
- Uses vanilla DOM APIs and CSS custom properties scoped under `.kb-root`.
- Gracefully handles missing date fields by disabling the Apply action and falling back to presets.
