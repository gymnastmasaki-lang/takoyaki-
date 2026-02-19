#!/bin/bash

# ========================================
# キャッシュドロア制御サーバー
# 自動セットアップスクリプト
# ========================================

set -e  # エラーで停止

echo ""
echo "🚀 キャッシュドロア制御サーバー セットアップ"
echo "=========================================="
echo ""

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. システムアップデート
echo -e "${YELLOW}📦 システムをアップデート中...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# 2. Node.jsのインストール確認
echo ""
echo -e "${YELLOW}📦 Node.jsをチェック中...${NC}"

if ! command -v node &> /dev/null; then
    echo "Node.jsが見つかりません。インストールします..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}✅ Node.js は既にインストールされています${NC}"
    node --version
    npm --version
fi

# 3. 作業ディレクトリ作成
echo ""
echo -e "${YELLOW}📁 作業ディレクトリを作成中...${NC}"
mkdir -p ~/drawer-server
cd ~/drawer-server

# 4. ファイルのダウンロード（またはコピー）
echo ""
echo -e "${YELLOW}📥 プログラムファイルをセットアップ中...${NC}"

# drawer-server.js が既に存在する場合はスキップ
if [ ! -f "drawer-server.js" ]; then
    echo -e "${RED}❌ drawer-server.js が見つかりません${NC}"
    echo "このスクリプトと同じディレクトリに以下のファイルを配置してください:"
    echo "  - drawer-server.js"
    echo "  - package.json"
    exit 1
fi

echo -e "${GREEN}✅ プログラムファイル確認完了${NC}"

# 5. npm パッケージのインストール
echo ""
echo -e "${YELLOW}📦 依存パッケージをインストール中...${NC}"
npm install

# 6. 実行権限付与
echo ""
echo -e "${YELLOW}🔐 実行権限を設定中...${NC}"
chmod +x drawer-server.js

# 7. systemdサービスのセットアップ
echo ""
echo -e "${YELLOW}⚙️  自動起動を設定中...${NC}"

# サービスファイルを作成
sudo tee /etc/systemd/system/drawer-server.service > /dev/null <<EOF
[Unit]
Description=Cash Drawer Control Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/drawer-server
ExecStart=$(which node) $HOME/drawer-server/drawer-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# systemdリロード
sudo systemctl daemon-reload

# サービス有効化
sudo systemctl enable drawer-server.service

# サービス起動
sudo systemctl start drawer-server.service

# 8. ステータス確認
echo ""
echo -e "${YELLOW}🔍 サービス状態を確認中...${NC}"
sleep 2
sudo systemctl status drawer-server.service --no-pager

# 9. IPアドレスを表示
echo ""
echo -e "${GREEN}=========================================="
echo "✅ セットアップ完了！"
echo "==========================================${NC}"
echo ""
echo "📡 このRaspberry PiのIPアドレス:"
hostname -I | awk '{print "   " $1}'
echo ""
echo "🌐 アクセスURL:"
IP=$(hostname -I | awk '{print $1}')
echo -e "   ${GREEN}http://${IP}:3000${NC}"
echo ""
echo "💡 次のステップ:"
echo "   1. ブラウザで上記URLを開いてテスト"
echo "   2. 「ドロアを開く」ボタンをクリック"
echo "   3. POSシステムの設定でこのIPアドレスを入力"
echo ""
echo "📝 便利なコマンド:"
echo "   - サービス状態確認: sudo systemctl status drawer-server"
echo "   - サービス再起動: sudo systemctl restart drawer-server"
echo "   - ログ確認: sudo journalctl -u drawer-server -f"
echo ""
