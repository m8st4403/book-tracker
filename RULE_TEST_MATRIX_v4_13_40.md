# 本棚アプリ ルール→検証マトリクス v4.13.40

| 分野 | 正常 | 境界 | 異常 | 状態遷移 | 保存再読込 | Browser/UI | Mutation |
|---|---:|---:|---:|---:|---:|---:|---:|
| ISBN | ○ | ○ | ○ | ○ | ○ | - | ○ |
| シリーズ/巻数 | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 並び順 | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 価格 | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 排他制御 | ○ | ○ | ○ | ○ | ○ | ○ | - |
| 検索競合 | ○ | ○ | ○ | ○ | - | ○ | ○ |
| UI表示 | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 設定 | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| カレンダー | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## UI表示契約
DOM存在 → computed display/visibility → width/height → scrollWidth/scrollHeight → Range実文字領域 → 親clip → viewport → 375/390/414px。

## 並び順契約
**指定されたsort key → 作品名 → 数値巻数 → 登録順**を全sort modeで直接comparatorに対して検証する。

## v4.13.46 P1 additions

| Rule | Verification | Gate |
|---|---|---|
| Settings survive reload | Save/read all settings domains | E2E-SETTINGS-001 |
| Settings failure is atomic | Synthetic storage failure + memory/UI rollback | E2E-SETTINGS-002 |
| Calendar tab filters are temporary | Reopen tab and compare with persistent defaults | E2E-CALENDAR-001 |
| Calendar extra save is atomic | Synthetic save failure | E2E-CALENDAR-002 |
| ICS release-date semantics | VALUE=DATE + escaping + stable UID | E2E-ICS-001 |
| Release notification window | today through +7 days inclusive | E2E-NOTIFY-001 |
