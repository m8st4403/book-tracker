# v4.13.198 開発ガード

現在の品質契約の正本は `QUALITY_CONTRACT.md` です。過去版の回帰一覧・ルール台帳・操作カタログを現行判定へ重複参照しません。

## 実行

```bash
npm test
```

`dev_guard.js` が現行 `index.html` を対象に静的検査、ロジック契約、Chromium Browser E2E、UI invariant、永続化、代表的な状態遷移を実行します。

```bash
npm run test:release
```

最終判定では `release_artifact_guard.js` も実行し、GitHubアップロード側に履歴資料が混入していないことを確認します。

## ガードの原則

- 固定作品の追加ではなく、共通不変条件・合成母集団・独立Oracleを優先する。
- 重要契約にはMutationを用意し、故障注入を検出できることを確認する。
- 入口・表示モード・状態遷移を横断して検査する。
- API待ち時間とユーザー操作待ちを実データ処理時間へ混入させない。
- 診断UIは原因調査用であり、品質判定の正本ではない。
- 未監査の機能をPASS扱いしない。

## v4.13.198 追加

シリーズscope吸収後の巻数ソートを、2種類のscope配置 × 6入力順 × ASC/DESC = 24ケースで検証します。さらに `series display sort` Mutationを注入し、再ソート処理を失わせた場合にGateがFAILすることを確認します。
