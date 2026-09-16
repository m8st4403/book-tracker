# v4.13.50

## 修正
- v4.13.49で発生した `metrics.measureProcessing is not a function` を修正。
- `measureProcessing()` は計測トークン `metrics` に対してではなく、計測API `window.bookTrackerRegistrationMetrics` に対して呼び出すよう統一。
- 単冊登録・一括登録の処理計測呼び出しを修正。
- v4.13.49の計測範囲修正（API通信時間をデータ処理時間から除外）は維持。
- 同じ呼び出しミスを検出する静的ガードを追加。

## 実機確認待ち
- カレンダーから1冊登録が完了すること。
- 1操作につき計測結果が1件であること。
- API通信時間がデータ処理時間に重複しないこと。
