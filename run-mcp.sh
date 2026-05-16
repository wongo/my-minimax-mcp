#!/bin/bash
export DOTENV_CONFIG_PATH="/home/nickw/Projects/minimax/.env"
export MINIMAX_WORKING_DIR="/home/nickw/Projects"
cd /home/nickw/Projects/minimax

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" --no-use
[ -s "$NVM_DIR/nvm.sh" ] && nvm use default >/dev/null 2>&1

exec node /home/nickw/Projects/minimax/dist/mcp-server.js
