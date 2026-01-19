#!/bin/bash
set -euo pipefail

# Only run on Claude Code web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing frontend dependencies..."
cd "$CLAUDE_PROJECT_DIR"
npm install

echo "Installing backend dependencies..."
cd "$CLAUDE_PROJECT_DIR/backend"
npm install

echo "Installing AWS SAM CLI..."
pip install --quiet --break-system-packages --ignore-installed aws-sam-cli

# Set test environment variable for Vitest
echo 'export VITE_API_URL="http://localhost:3000"' >> "$CLAUDE_ENV_FILE"

echo "Session setup complete!"
echo "AWS deployment commands available:"
echo "  - sam build && sam deploy (backend)"
echo "  - npm run build && aws s3 sync dist/ s3://todo-app-frontend-894183034230/ --delete (frontend)"
