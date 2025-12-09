# sAIdebar

Chrome拡張機能として動作するAIチャットサイドバー

![](https://i.imgur.com/VuGOTEq.png)

任意のWebページにAnthropic Claude APIを使用したチャット機能を追加します。  
BYOK(bring your own key)専用です。  
直接AnthropicのAPIを使用するほかに、[GLM Coding Plan](https://z.ai/subscribe)をはじめとするAnthropic互換APIにも対応しています。

## Features

- 任意のWebページにサイドバーを表示
- Anthropic Claude APIによるAIチャット
- ストリーミングレスポンス対応
- ページ要約機能
- ダークテーマUI
- ドラッグでトグルボタン位置を調整可能
- 複数のAPIプロバイダー対応（Anthropic、Z.AI、カスタム）

## Installation

### GitHub Releasesからインストール（推奨）

1. [Releases](https://github.com/common-creation/saidebar/releases)ページから最新版をダウンロード
2. **CRXファイルを使用する場合：**

   - `saidebar.crx` をダウンロード
   - `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - CRXファイルをページにドラッグ＆ドロップ
3. **ZIPファイルを使用する場合：**

   - `saidebar.zip` をダウンロードして展開
   - `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - 展開したフォルダを選択

### ソースからビルド

1. リポジトリをクローン

   ```bash
   git clone https://github.com/common-creation/saidebar.git
   cd saidebar
   ```
2. 依存関係をインストール

   ```bash
   npm install
   ```
3. ビルド

   ```bash
   npm run build
   ```
4. Chromeで拡張機能をロード

   - `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist/` ディレクトリを選択

## Usage

1. 任意のWebページを開く
2. 画面右端に表示される青いトグルボタンをクリック
3. 初回使用時は設定ボタン（歯車アイコン）からAPI Keyを設定
4. チャット入力欄にメッセージを入力して送信

### ページ要約

「ページを要約」ボタンをクリックすると、現在閲覧中のページの内容をAIが要約します。

## Development

```bash
# ファイル変更を監視して自動ビルド
npm run watch

# ビルド成果物を削除
npm run clean

# .crxファイルとしてパッケージング
npm run package
```

## Configuration

設定モーダルで以下の項目を設定できます：

- **API Provider**: Anthropic / Z.AI / カスタム
- **API Key**: Anthropic API Key
- **Custom API URL**: カスタムプロバイダー使用時のエンドポイントURL
- **Model**: 使用するモデル（API Keyを設定後「取得」ボタンで一覧を取得）
- **System Prompt**: AIへのカスタム指示

## License

MIT
