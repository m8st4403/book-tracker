# v4.13.66

## NDL通常検索Adapter改善
- NDL Searchの通常キーワード検索をSRUからOpenSearchへ切り替え。NDL公式仕様で提供されているOpenSearch検索を使用。
- `intitle:` / `inauthor:` / 通常キーワードをOpenSearchの対応パラメータへ明示的に変換。
- OpenSearch RSS/XMLの書誌情報をアプリのBookRecord形式へ正規化。
- ISBN照会は既存のSRU経路を維持。
- Google Booksタイムアウト→NDLフォールバックの既存計測・排他制御・4秒上限を維持。
- バージョン表記を4.13.66へ統一。
