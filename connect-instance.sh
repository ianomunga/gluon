#!/usr/bin/env bash
set -euo pipefail

# ----------- Load .env variables if not already exported -----------
ENV_FILE="$(dirname "$0")/../.env"
if [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# ----------------- Configuration from .env ------------------
SBO_URL="${SUPABASE_URL:-}"
SBO_TOKEN="${SUPABASE_SERVICE_ROLE_KEY:-}"
SBO_TABLE="instances"
SSH_DIR="${SSH_KEY_DIR:-$HOME/.ssh}"
DEFAULT_KEY_NAME="${DEFAULT_KEY_NAME:-dataspiresCC-aws}"
LOCAL_USER_ID="${1:-}"  # Passed as CLI arg
# ------------------------------------------------------------

if [[ -z "$SBO_URL" || -z "$SBO_TOKEN" ]]; then
  echo "Error: Supabase URL or token not found in environment."
  exit 1
fi

if [[ -z "$LOCAL_USER_ID" ]]; then
  echo "Error: No user_id provided. Usage: ./connect-instance.sh <user_id>"
  exit 2
fi

echo "🔍 Fetching latest EC2 instance for user: $LOCAL_USER_ID"

resp=$(curl -s \
  -H "Authorization: Bearer $SBO_TOKEN" \
  -H "apikey: $SBO_TOKEN" \
  "$SBO_URL/rest/v1/$SBO_TABLE?user_id=eq.$LOCAL_USER_ID&select=ssh_connection_string,pem_private_key,instance_id,public_ip&order=created_at.desc&limit=1")

if [[ -z "$resp" || "$resp" == "[]" ]]; then
  echo "No instance found for user: $LOCAL_USER_ID"
  exit 3
fi

# Extract fields using jq
ssh_conn=$(echo "$resp" | jq -r '.[0].ssh_connection_string')
pem_key=$(echo "$resp" | jq -r '.[0].pem_private_key')
public_ip=$(echo "$resp" | jq -r '.[0].public_ip')
instance_id=$(echo "$resp" | jq -r '.[0].instance_id')

if [[ -z "$ssh_conn" || -z "$pem_key" || -z "$public_ip" || -z "$instance_id" ]]; then
  echo "Missing fields in instance record."
  exit 4
fi

# Parse connection details
key_path=$(echo "$ssh_conn" | awk '{for(i=1;i<=NF;i++) if($i=="-i") print $(i+1)}')
ssh_target=$(echo "$ssh_conn" | awk '{print $NF}')
key_name=$(basename "$key_path")
target_key_path="$SSH_DIR/$key_name"

echo "SSH key path: $target_key_path"
echo "SSH target: $ssh_target"

# Prepare ~/.ssh
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# Save PEM file if not already there
if [[ ! -f "$target_key_path" ]]; then
  echo "Saving PEM key to $target_key_path"
  echo "$pem_key" > "$target_key_path"
  chmod 400 "$target_key_path"
else
  echo "PEM already exists locally."
fi

echo "Connecting to EC2 instance..."
exec ssh -i "$target_key_path" "$ssh_target"
