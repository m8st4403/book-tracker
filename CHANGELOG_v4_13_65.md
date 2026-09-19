# v4.13.65

## 通常の書籍検索フェイルオーバー

- Google Books のキーワード検索がタイムアウトした場合に、NDL Searchへ自動フェイルオーバーするよう検索Provider優先順位を更新。
- NDL Searchを通常検索のフォールバックProviderとして有効化。楽天Booksは認証情報が必要なため従来どおり無効。
- Google Books / NDL SearchにProvider別4秒タイムアウトを設定。
- 検索のtimeout→NDL fallbackを自動テストで固定化。
- アプリ、README、package.json、Dev Guard、キャッシュバスターのバージョン表記を4.13.65へ統一。

## 期待する動作

Google Booksが約4秒でタイムアウトした場合、NDL Searchへ進み、結果を取得できれば検索成功となる。各Providerの通信時間・API回数・結果件数は既存の検索計測へ記録する。
