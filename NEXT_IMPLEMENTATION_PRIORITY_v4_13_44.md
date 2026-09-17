# 本棚アプリ 次期実装優先順位 v4.13.45

## P0 — 先に検証基盤を完成させる

1. 永続化E2E：books / meta / calendarExtras / purchaseGroups / settings / seriesView の保存→reload→再表示
2. バックアップ：export→import→reloadのラウンドトリップとschemaVersion検証
3. 複数storage操作のatomicity／失敗時rollback
4. package / APP_VERSION / README / Guard / ZIP名のバージョン整合

## P1 — 現行本棚機能の未検証領域を埋める

1. カレンダー追加・削除・表示フィルターの保存と関連画面整合
2. 設定全項目の保存→reload→反映
3. ICS生成内容の意味検証
4. 発売通知のpermission / 日付範囲 / 重複条件

## P2 — 本棚機能としての次期実装

ロードマップのPLANNED機能は、P0/P1の検証基盤を整えてから着手する。優先候補は発売日エンジン、OCR、推薦、ネイティブiOS化の順で、各機能は着手時にPLANNED→CURRENTへ昇格させる。

## 判断基準

- UIだけ追加して終わりにしない
- 保存を伴う機能はreloadとbackup/restoreまで含める
- 複数データ領域を変更する操作はatomicityを確認する
- 既存ルールに検証方法がなければ、実装より先にルール／検証契約を追加する
