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


## v4.13.164追加ゲート
- 作者フィルターは表記揺れだけでなく、構造化作者情報・連結書誌・候補集合の同一性をBrowser E2Eで確認する。
- 同一作者の複数表記が1候補へ集約され、連結書誌でも同一作者を選択でき、別人は集合差がある限り統合されないことを確認する。
- 作者フィルターの正規化で保存データが変更されないことを確認する。
- 年号／生没年形式など明らかな非作者文字列が作者候補へ表示されないことを確認する。


## v4.13.167 作者典拠取得経路ゲート
- NDL OpenSearch/SRUのcreator URI抽出を共通fixtureで検証する。
- 典拠URIがない書誌から典拠IDを推測生成しないことを検証する。
- 作者表示値、authorNames、authorEntitiesを混同せず保存値を変更しない。
- NDL Searchの利用条件を確認し、追加の常時SPARQL通信を実装しない判断を記録する。
- 作者以外の出版社・シリーズを特定Providerの個別例で補正しない。


## v4.13.167 追加ゲート
- 書誌同一性の表示値／判定キー分離を作者・出版社・シリーズで監査する。
- 異なる出版社・同名異人・別シリーズを推測統合しない。
- 内部キーをUIへ表示せず、保存済み書誌値を変更しない。


## v4.13.172 フィルター状態テキスト共有ゲート
- 蔵書タブの「フィルター状態をコピー」が存在する。
- コピー内容にフィルター状態・候補一覧・冊数が含まれる。
- 内部判定キーが利用者向けテキストへ漏れない。
- コピー前後で通常データが不変である。

## v4.13.172 追加ゲート

- 作者フィルターの姓名表記は固定作品テストではなく、同値変形（カンマ種別、空白、末尾カンマ、複数作者）を入力する性質ベーステストを必須とする。
- `姓,` / `名,` のような誤分割候補を検出する境界ゲートを含める。
- 作者フィルター修正後も出版社・シリーズ・読書状態など他フィルターの候補生成と絞り込みが変化しないことを確認する。


## v4.13.173 登録経路共通化ゲート
- ISBN直接、検索結果、検索結果カード、検索結果一括、ISBN一括、カレンダー、詳細の各入口が共通書誌準備経路へ接続されている。
- 一括可能な入口が共通コミット経路を使用する。
- 新規入口を追加する場合、入口固有の書誌正規化を先に実装せず、共通契約への接続を先に確認する。
- blank/placeholder保存禁止を個別ISBNではなく全候補の不変条件として扱う。

## v4.13.174 Property / Mutation Gate
- 固定書籍を追加するだけの回帰テストでは配布可としない。
- 合成母集団で候補集合・結果集合・複合条件・保存値不変を検証する。
- 意図的欠陥を注入し、テストがFAILすることを毎リリース確認する。
- テスト件数の増加ではなく、故障検出能力を品質向上の証拠とする。
- 実機では選択→複合条件→解除→リセット→再表示を1状態遷移として確認する。


## v4.13.175 次工程契約
- v4.13.174で確立したProperty→Mutation→E2E方式を発売日エンジンにも適用する。
- 日付そのものだけでなく、精度・確度・出典・通知/ICS適用可否の関係を不変条件として検証する。
- 実在作品の追加ではなく、合成日付母集団と故障注入を基本とする。
