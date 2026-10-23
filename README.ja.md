# SAGBAL

**Movement arbitration — a stratum on Kimetron Isle.**

Kimetron Isle は島であり、島には層が堆積する。
同じ「物理の真実」という岩盤の上に、薄い層がひとつずつ重なって
いく——それぞれの層がひとつの専門を担い、それぞれが
*stratum*（層）と呼ばれる。

stratum は島の事実を読み取り、その上の世界へ「意味」に翻訳して
渡す層。岩盤を書き換えることはない。**SAGBAL はその第1層**——
物理と意図のあいだに堆積した、移動の交渉層である。

移動は「解決」されるものではなく「交渉」されるもの。
Kimetron が物理の真実（ジオメトリ・占有・`tryMove` の成否）を握り、
SAGBAL はその事実を移動の**事象**（競合・譲り・阻害）に翻訳し、
競い合う意図を仲裁する。層はこれで終わらない。

名前の由来: シュメール語 *sag*（前・先）+ *bal*（交差・移し替え）
——「前方の交差を裁く層」。

## 層構造

```
App（ポリシー）      目的・意図スコア・経路知識（門の存在）・
                    次の目標の規則 —— ゲーム語彙はここ
SAGBAL（層）         意図収集・スコアオークション・譲りヒステリシス・
                    via経由点・阻害検出・休眠目標とwake条件
Kimetron Isle        物理の真実のみ：footprint・固体・
                    tryMove 成否・ブロッカー同一性
```

事実は上に、決定は下に流れる。Kimetron は「目標」や「門」を知らず、
App はジオメトリを扱わない。

## 構成

| パス | パッケージ | 役割 |
|------|-----------|------|
| `packages/core` | `@kimetron/core` | Kimetron Isle コアエンジン（同梱 v1.2.0） |
| `packages/dom` | `@kimetron/dom` | DOM レンダラ（同梱） |
| `packages/react` | `@kimetron/react` | React アダプタ（同梱） |
| `packages/sagbal` | `@kimetron/sagbal` | 層の本体 —— 仲裁・目標・stratumイベント |
| `app/` | `sagbal-app` | デモ：門付きの壁を隔ててポストを巡るスライム6体＋ドラッグ可能なプレイヤー |

## デモ

https://github.com/user-attachments/assets/78c925dd-203a-475f-9c76-adfd4f9b20b6

- 徘徊者6体が目的地ポストを巡回し、到着すると約3秒滞留。
  一つしかない門が競合を引き起こす。
- プレイヤー **P** は手でドラッグ —— 物理の真実は全員に同一。
- イベントログに `contention` / `yield` / `blocked by` / `impeded` /
  `dwell` / `arrived` / `woke` が素通しで流れる。
- 衝突は正直：ユニットは不可視の16角形footprint＋App描画の
  スプライト。Pを門へ運ぶと、壁は拒否し、開口は通す。
- ドラッグは「配置」ジェスチャ（Kimetronはゲームではなく配置
  エンジン）：経路ではなく着地地点が検査される——壁を越えて
  持ち上げて置くことはできるが、壁の中には置けない。

## 開発

```sh
npm install
npm run dev -w sagbal-app   # デモ http://localhost:5173
npm run typecheck           # 全ワークスペース
npm run build -w sagbal-app # プロダクションビルド
npx vitest run              # テスト
```

## 状態

v0.1 骨格 —— 意図収集・スコアオークション・譲りヒステリシス・
via経由点・阻害検出・目標切替・休眠目標のwakeを実装。
相互退避・拡散・ライブロック検出は未実装。

## License

MIT
