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
