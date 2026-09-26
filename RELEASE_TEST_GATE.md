# Release Test Gate v4.13.31

## 目的

過去の不具合だけを再発防止するのではなく、今後追加される未知のUI・状態・機能についても、ユーザーの目視より前に問題を検出できるリリースゲートを作る。

## Gate 1 — Static

- JavaScript/HTML構文
- 重複ID
- 必須6タブ
- 正規登録経路
- SPEC/テスト文書の存在
- Roadmap Test Matrix の存在

## Gate 2 — Logic

機能単位ではなく、仕様の不変条件をテストする。特に状態遷移、正規化、価格、API、シリーズ、フィルター、保存/復元を対象にする。

## Gate 3 — Integration

複数機能を連結して検証する。例：セット購入→一部定価確定→蔵書総額→価格フィルター→バックアップ/復元。

## Gate 4 — Browser E2E

配布対象の `index.html` をChromiumで実際に開き、6タブを操作する。現在は390×844を基準にし、文字サイズ小/中/大を走査する。将来は375/414等も追加する。

## Gate 5 — Generic UI Invariants

過去のバグ固有セレクタだけでなく、画面全体を走査する。

- 水平方向の意図しないoverflow
- 固定要素の画面外脱落
- 文字のellipsis/nowrapによる意図しないclip
- 画面切替後に表示されるべきsectionが非表示のままになっていないか
- 主要操作要素の存在

## Gate 6 — Visual Regression

主要画面・フォントサイズ・画面幅ごとのスクリーンショットを保存し、将来は基準画像との差分を自動比較する。単独の画像比較を唯一の合格条件にはせず、DOM実測と併用する。

## Gate 7 — Mutation / Fault Injection

テスト基盤が実際にバグを検出できることを確認する。代表例：

- 未確定価格を総額へ加算 → FAIL
- 0円確定を未確定扱い → FAIL
- retailPriceを定価に採用 → FAIL
- 価格フィルターを逆転 → FAIL
- 5列を6列へ変更 → FAIL
- nowrap/ellipsisを意図しない表示要素へ付与 → FAIL
- canonical ISBNを無視 → FAIL

## Gate 8 — Package / ZIP

1. リリースZIPを作成
2. 別ディレクトリへ展開
3. 展開後のファイルをテスト
4. `dev_guard.js` 自体が含まれることを確認
5. README/SPEC/テストバージョン一致
6. 全Gate PASS後のみ配布可能

## Gate 9 — Roadmap Contract

将来機能は `ROADMAP_TEST_MATRIX.md` に仕様と失敗条件を先に定義する。実装時にCURRENTへ昇格し、既存の全Gateへ接続する。

## Fail-fast rule

どれか1つでもFAILしたリリースは「テスト済み」と扱わず、ユーザーへ渡さない。

## v4.13.32 追加ゲート

既存蔵書シリーズ再整理は、series以外のデータを変更しないこと、外伝等を自動統合しないこと、二重実行しないことを満たさない限りリリース不可。

## v4.13.46 — P1 calendar/settings/ICS/notification gate

- E2E-SETTINGS-001/002: all persistent settings round-trip and failed writes roll back both memory and UI.
- E2E-CALENDAR-001/002: temporary calendar filters re-sync from saved defaults; calendar-extra write failure rolls back.
- E2E-ICS-001: release-date ICS uses VALUE=DATE, escaped text values, stable deterministic UIDs, and excludes invalid dates.
- E2E-NOTIFY-001: notification target window is inclusive from today through seven days later; disabled/invalid dates are excluded.

## v4.13.152 — 引き渡し前実動作必須ルール

新規診断機能は静的配線チェックだけでは配布可としない。引き渡し前に、実際のBrowser E2Eで代表対象を最後まで処理する。

必須確認：
- 対象ISBNを5件以上、Providerを4経路以上、逐次処理すること
- 処理中表示・操作ロック・完了表示を確認すること
- 結果が途中で消えないこと
- コピーが実際に結果本文を取得すること
- クリアが実際に結果領域を空にすること
- 診断中に蔵書データが変更されないこと
- 失敗時にエラー表示して操作ロックを解除すること
- 既存診断との排他制御を確認すること

上記の実動作E2Eが未実施、またはFAILの場合は、他のGateが全PASSでも引き渡し不可。


## v4.13.153 — Provider設定状態ゲート

ISBNシリーズ供給源診断は「有効API」の意味を実際のProvider設定状態と一致させる。未設定の楽天BooksはSKIPPED（楽天Books未設定）、既定OFFのGoogle BooksはSKIPPED（Google Books無効）と表示し、未設定Providerへ通信してはならない。
