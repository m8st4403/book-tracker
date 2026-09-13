# Book Tracker — Roadmap Test Matrix v4.13.30

この文書は「将来実装する機能を、実装した後に慌ててテスト追加する」状態を防ぐための先行テスト契約です。
ロードマップは v4.9.2 の分析資料を基準にし、現時点で未実装の項目は `PLANNED` として管理します。PLANNED は現行版の合格条件にせず、実装開始時に `CURRENT` へ昇格してリリースゲートへ入れます。

## 現行コア機能（CURRENT）

| ID | 領域 | テスト契約 |
|---|---|---|
| CORE-NAV | 6タブ | 6タブ存在、タップ遷移、表示状態が1つに収束 |
| CORE-ISBN | ISBN | 10/13正規化、重複排除、最大30冊、一括登録 |
| CORE-SCAN | スキャン | 対応時連続読取、最大30冊、非対応時手入力フォールバック |
| CORE-LIB | 蔵書 | 検索・各フィルター・並び順・シリーズ・巻抜け・状態変更 |
| CORE-CAL | カレンダー | 月移動、今日、日付詳細、蔵書/関連/おすすめ、一時フィルター、ICS |
| CORE-SET | 設定 | プロフィール、テーマ、文字サイズ、背景、自作スキン、バックアップ/復元 |
| CORE-API | API | Adapter、schema/意味検証、信頼度、価格・シリーズのcritical扱い |
| CORE-PRICE | 価格 | 定価と購入総額の分離、未確定、0円確定、一部確定、総額集計 |
| CORE-UI | UI品質 | 全タブ・全フォント・複数幅でoverflow/clip/重なりを検査 |

## Phase 2：ネイティブiOS MVP（PLANNED）

| ID | 機能 | 実装時の必須テスト |
|---|---|---|
| IOS-SWIFTUI | SwiftUI移行 | Web版の状態モデルとiOS状態モデルの意味一致、画面遷移、復帰 |
| IOS-DYNAMIC-TYPE | Dynamic Type | 全主要画面を全Dynamic Typeサイズで実測、文字切れ・タップ領域・レイアウト崩れをFAIL |
| IOS-VOICEOVER | VoiceOver | 主要操作のアクセシビリティラベル、順序、状態読み上げ |
| IOS-CAMERA | カメラ/バーコード | 権限許可/拒否/再許可、連続ISBN、重複、最大30冊、失敗時手入力 |
| IOS-EVENTKIT | EventKit | 権限状態別処理、追加/更新/削除、重複イベント防止、拒否時フォールバック |
| IOS-NOTIFY | UserNotifications | 権限、予定変更、取消、重複通知防止、時刻境界、削除連動 |
| IOS-DATA | SwiftData/Core Data | migration、欠損値、旧版データ、トランザクション、保存失敗時ロールバック |
| IOS-CLOUD | iCloud等の端末間同期（CloudKit採用時） | 明示opt-in、同期競合、削除、オフライン、端末追加/削除、データ所有権 |

## Phase 3：OCR（PLANNED）

| ID | 機能 | 必須テスト |
|---|---|---|
| OCR-ISBN | ISBNバーコード | 誤読、複数冊、重複、最大30冊、手入力フォールバック |
| OCR-COVER | 表紙OCR | 候補抽出、低信頼候補、ノイズ、候補なし |
| OCR-SPINE | 背表紙OCR | 縦書き、複数冊、分割候補、誤順序 |
| OCR-CANDIDATE | 候補提示 | **自動確定しない**、ユーザー確認必須、取消可能 |
| OCR-SEARCH | OCR→ISBN検索 | 候補選択後のみ検索、誤候補を蔵書へ直接登録しない |

## Phase 4：発売日エンジン（PLANNED）

| ID | 機能 | 必須テスト |
|---|---|---|
| RELEASE-MODEL | Book→Series→Volume→ReleaseEvent | 関係の一意性、巻・版・地域の分離 |
| RELEASE-SOURCE | source/confidence/updatedAt | 出典保持、低信頼値の扱い、更新履歴 |
| RELEASE-REGION | 地域別発売日 | JP/海外を混同しない、地域未指定時の安全な表示 |
| RELEASE-CHANGE | 発売日変更 | カレンダー反映、旧イベント処理、通知再計画 |
| RELEASE-CONFLICT | 情報源矛盾 | 単純多数決でcritical値を確定しない |

## Phase 5：推薦・発見（PLANNED）

| ID | 機能 | 必須テスト |
|---|---|---|
| REC-BEHAVIOR | 行動ベース入力 | 所有、読了、未読、お気に入り、評価、検索等の意味を正しく利用 |
| REC-SERIES | シリーズ補完 | 巻抜けを正しく候補化、所有済みを重複推薦しない |
| REC-AUTHOR | 著者新刊 | 著者一致、地域/版の混同防止 |
| REC-REASON | 理由表示 | 「同じ作者」等の理由が実際の根拠と一致、架空理由禁止 |
| REC-NO-ATTRIBUTE | 属性推定禁止 | 年齢・性別・人種等から読書傾向を推定しない |
| REC-USER-CONTROL | 基準調整 | ユーザー設定が推薦結果に反映、OFF項目は根拠に使わない |

- 購入先の正式な商品データ連携

## 収益化（PLANNED）

| ID | 機能 | 必須テスト |
|---|---|---|
| MON-AFF | 購入リンク/アフィリエイト | リンク生成、開示、対象外商品の誤リンク防止、利用規約条件を実装前確認 |
| MON-PRO | Pro買い切り | entitlement、復元購入、未購入時の機能制限、購入後の状態同期 |
| MON-SUB | サブスク | renewal/expiry/grace/restore、オフライン、解約後権限 |
| MON-B2B | 出版社/書店連携 | データ権限、表示出典、外部提供、利用規約 |

## App Store / プライバシー（PLANNED）

- App Privacy申告と実データアクセスの一致
- 権限拒否時の機能劣化と代替経路
- データ削除・エクスポート
- 利用規約・プライバシーポリシーへの導線
- VoiceOver / Dynamic Type / ダークモード / 各iPhoneサイズ
- API規約・書影・商品データ・購入リンクの権利条件

## 重要ルール

1. PLANNED機能は現行版で「未実装だからFAIL」にはしない。
2. ただし、将来機能の仕様・失敗条件・安全条件は実装前にテスト契約を作る。
3. 実装着手時に必ず `PLANNED → CURRENT` へ移し、ロジック・統合・E2E・UI品質のリリースゲートへ追加する。
4. 機能追加で既存機能に影響する場合、追加機能のテストだけでなく依存する既存テストを再実行する。
5. 「UIに表示された」だけでは機能完了とせず、保存→再読込→関連画面→バックアップ/復元まで確認する。
