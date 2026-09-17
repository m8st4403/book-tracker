# v4.13.53

## カレンダー登録時の不要なISBN再照会を修正

### 実機で確認された事実
- v4.13.52ではカレンダーから1冊登録すると `googleBooks: 12005 ms` の後に `openBD: 387 ms` が実行され、ISBNフォールバック自体は機能した。
- しかしカレンダーイベントに保持されていた `series` 情報が `calendarBookFromEvent()` で登録用BookRecordへ引き継がれていなかった。
- そのため、シリーズ情報を既に持つカレンダー書籍でも `prepareRegistrationBook()` が `resolveIsbn()` を呼び、Google Booksの12秒タイムアウトを待っていた。

### 今回の変更
- `calendarBookFromEvent()` でカレンダーイベントの `series` を登録用BookRecordへ引き継ぐ。
- 文字列形式のシリーズ名は既存の `parseVolumeTitle()` でタイトルから巻数を補完し、登録時のシリーズ情報として正規化する。
- シリーズ名＋巻数が既に得られている場合は `prepareRegistrationBook()` の早期終了条件を満たすため、ISBN再照会を行わない。
- API管理・フェイルオーバーの優先順位は変更しない。

### 次の確認
- カレンダーから同じサンプル書籍を1冊登録し、Google Books/openBDのAPI通信が発生しないことを実機で確認する。
- API通信なしで登録できることを確認した後、必要な場合だけGoogle Booksタイムアウト／AbortController対応へ進む。
