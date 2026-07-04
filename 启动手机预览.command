#!/bin/zsh

cd "$(dirname "$0")" || exit 1

IP_ADDRESS="$(ipconfig getifaddr en0 2>/dev/null)"
if [[ -z "$IP_ADDRESS" ]]; then
  IP_ADDRESS="$(ipconfig getifaddr en1 2>/dev/null)"
fi

clear
echo "2026 世界杯观赛指南 - H5 手机预览"
echo ""
echo "请保持此窗口打开。"
echo "手机和电脑连接同一 Wi-Fi 后，访问："
echo ""
echo "http://${IP_ADDRESS}:8780/"
echo ""
echo "按 Control+C 可停止预览服务。"
echo ""

python3 -m http.server 8780 --bind 0.0.0.0 --directory dist
