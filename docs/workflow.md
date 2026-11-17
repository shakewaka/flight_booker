# 作業の進め方

個人開発ですが、作業ごとにブランチを作り、PR（プルリクエスト：変更を`main`へ取り込む前の確認の場）を通して取り込みます。変更の理由と確認結果が履歴に残り、CI（自動チェック）を通ったものだけが`main`に入ります。

```text
① 作るものを決める → ② ブランチを作る → ③ 実装して確認する → ④ コミット
→ ⑤ pushしてPRを作る → ⑥ CIを確認して取り込む → ⑦ mainを最新にする
```

## 基本のルール

- 1つの作業 ＝ 1つのブランチ ＝ 1つのPR。
- `main`は常に起動でき、`npm run check`が成功する状態を保つ。`main`へ直接コミットしない。
- Issueは任意。不具合の記録や、複数のPRにまたがる大きな作業の整理に使う。
- 長期間使う`develop`ブランチは設けない。

## ① 作るものを決める

「ゲームを全部」ではなく、「条件メモを右上に表示する」「予約時に在庫を1席消費する」のように、完了を確認できる大きさにします。目安は、1つのPRの差分を一度に読み切れる量です。

作業の候補は[roadmap.md](roadmap.md)にあります。Issueを使う場合は、ひな形に目的・範囲・完了条件を書きます。

## ② ブランチを作る

```bash
git status
git switch main
git pull --ff-only
git switch -c front/workspace-layout
```

未コミットの変更が残っている場合は、先に差分を確認します。別の作業の変更を混ぜません。

ブランチ名は`<分野>/<短い英語の説明>`にします。Issueがある場合は`<分野>/<番号>-<説明>`にします。

| 分野    | 使う場面                    | 例                         |
| ------- | --------------------------- | -------------------------- |
| `front` | 画面、フォーム、タブ        | `front/workspace-layout`   |
| `game`  | 在庫、価格、予約、集計、NPC | `game/shared-inventory`    |
| `docs`  | 企画書や開発資料            | `docs/penalty-rules`       |
| `chore` | ツール、設定、CI            | `chore/update-deps`        |
| `fix`   | 不具合の修正                | `fix/release-unpaid-holds` |

## ③ 実装して確認する

```bash
npm run dev
```

画面や操作をブラウザで確認した後、チェックを実行します。

```bash
npm run format
npm run check
npm run build
```

在庫・予約・順位などのゲーム処理を変えるときは、境界条件のテストを同じPRに含めます。

## ④ コミット

```bash
git status
git diff
git add <記録するファイル>
git commit -m "feat: 条件メモの表示を追加"
```

`git add .`でまとめて追加する前に、`git status`で無関係なファイルが含まれていないことを確認します。

メッセージは`<種類>: <日本語の説明>`にします。Issueがある場合は、末尾に`(#12)`のように番号を付けます。

| 種類       | 使う場面                       |
| ---------- | ------------------------------ |
| `feat`     | 機能の追加                     |
| `fix`      | 不具合の修正                   |
| `docs`     | 資料だけの変更                 |
| `refactor` | 動作を変えないコードの整理     |
| `test`     | テストだけの追加・修正         |
| `chore`    | 設定、依存ライブラリ、CIの変更 |

作業の区切りごとに、何回コミットしても構いません。

## ⑤ pushしてPRを作る

```bash
git push -u origin HEAD
gh pr create --web
```

`gh pr create --web`はブラウザでPRの作成画面を開きます。GitHubの画面から作成しても同じです。ひな形に沿って、変更したこと、確認方法と結果、画面を変えた場合はスクリーンショットを書きます。Issueがある場合は、本文に`Closes #12`と書くと、取り込み時にIssueが自動で閉じます。

## ⑥ CIを確認して取り込む

PRを作ると、GitHub Actionsがコード・型・テスト・書式・ビルドを確認します。

1. PRの「Files changed」で、差分を自分でもう一度読む。
2. CIが成功していることを確認する。失敗した場合は「Details」でエラーを確認し、修正してpushする。
3. 「Squash and merge」で取り込む。1つのPRが`main`の1つのコミットになる。
4. 取り込み後、ブランチを削除する。

## ⑦ mainを最新にする

```bash
git switch main
git pull --ff-only
```

## 困ったとき

### mainで作業を始めてしまった（未コミット）

```bash
git switch -c front/workspace-layout
```

変更はそのまま新しいブランチへ移ります。

### PRに「conflicts」と表示された

```bash
git switch main
git pull --ff-only
git switch front/workspace-layout
git merge main
```

`CONFLICT`と表示されたファイルを開き、両方の変更を確認して直します。その後`npm run check`を実行し、コミットしてpushします。

### 状態が分からなくなった

`git status`と`git log --oneline -5`で、現在のブランチと直近の履歴を確認します。`git reset --hard`や`git push --force`は変更が消えるため、意味を確認してから使います。

## ブランチ保護について

GitHubの無料プランでは、非公開リポジトリにブランチ保護（`main`への直接pushの禁止や、CI成功の必須化）を設定できません。現在はこの手順を運用で守ります。リポジトリを公開するときに、`main`へ次の設定を追加します。

- PRを経由しないpushの禁止。
- CI（`check`）の成功を取り込みの条件にする。

## AIエージェントに頼むとき

AIエージェントは[AGENTS.md](../AGENTS.md)を読んで作業します。Claude Codeは`CLAUDE.md`経由で同じ内容を読みます。範囲と、まだ作らないものを伝えると、変更が小さくまとまります。

```text
docs/roadmap.mdの「1. 画面の基本配置」を進めてください。
今回の範囲は80%・20%の配置と資料の切り替えまでです。
減点や予約処理はまだ作らないでください。
ブランチはfront/workspace-layoutで、PRの作成までお願いします。
```
