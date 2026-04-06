#!/bin/bash
export DOTENV_CONFIG_PATH="/home/nickw/Projects/minimax/.env"
cd /home/nickw/Projects/minimax
exec /home/nickw/.nvm/versions/node/v24.12.0/bin/node /home/nickw/Projects/minimax/dist/mcp-server.js
