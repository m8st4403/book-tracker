# 永続化・バックアップ検証契約 v4.13.45

## 目的

保存処理の「存在」ではなく、保存されたデータが次回起動後にも同じ意味を持つこと、複数データ領域の更新失敗で部分状態を残さないことを検証する。

## 適用対象

- books_v41
- bookTrackerMeta_v483
- calendarExtras_v442
- bookTrackerPurchaseGroups_v1
- book_tracker_settings_v449
- seriesView_v444
- demo状態管理キー

## 検証フロー

1. 正しい状態をfixtureとして定義
2. storageへ保存される文字列を取得
3. 同じ保存文字列を起動読込関数へ再投入
4. books/meta/calendar/purchase/settings/seriesViewの意味を比較
5. バックアップを作成
6. 全保存領域を空にして復元
7. 元の保存文字列と一致することを確認
8. schemaVersion違い・未知キーを拒否
9. 復元途中の保存失敗を注入し、元状態へrollback
10. Mutation Testで保護処理を削除した場合にGateがFAILすることを確認

## 実ブラウザについて

現行Release Gateはisolated storage shimを使用するため、OS上の永続localStorageそのものをプロセス再起動させる試験ではない。代わりに保存バイト列を同じ起動読込経路へ再投入することで、アプリ側の永続化契約を決定論的に検証する。実機確認では別途「保存→アプリ終了→再起動」を確認する。
