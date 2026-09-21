# CHANGELOG v4.13.111

## 登録コミット地点の特定
- v4.13.110で確認された「preparedBooksは正常だが、追加後booksに登録ISBNが残らない」現象を切り分けるため、登録オブジェクト生成→追加配列→books追加直後→保存直前→保存完了を段階計測。
- 登録コミットオブジェクトを明示的に `{...prepared, isbn: preparedIsbn, title: preparedTitle}` として生成し、選択検索結果のISBN・タイトルを保持。
- 追加直後に期待したISBNがbooksへ存在するか整合性検査し、不一致なら保存せずロールバック。
- 空データを後処理で掃除するだけの対策は追加せず、発生地点を特定する診断を優先。
- バージョン表記、package.json、api_management.jsのクエリを4.13.111へ統一。
