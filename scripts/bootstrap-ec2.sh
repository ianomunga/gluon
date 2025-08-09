#!/bin/bash
set -euo pipefail

SUPABASE_FUNCTION_URL="$1"
SUPABASE_SERVICE_ROLE_KEY="$2"
SESSION_ID="$3"

notify_webapp() {
  curl -s -X POST "$SUPABASE_FUNCTION_URL" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"session_id":"'"$SESSION_ID"'","status":"ready"}'
}

check_python_package() {
  python3 -c "import $1" &> /dev/null
}

install_needed=false
reboot_needed=false

for pkg in ipykernel jupyterlab notebook; do
  if ! check_python_package $pkg; then install_needed=true; fi
done

if [ "$install_needed" = true ]; then
  echo "Installing required system and Python packages..."

  sudo apt-get --purge remove -y "*nvidia*" || true
  sudo apt autoremove -y
  sudo apt install -y ubuntu-drivers-common
  sudo ubuntu-drivers autoinstall && reboot_needed=true
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y python3-pip python3-venv build-essential python3-dev libffi-dev libssl-dev git wget curl unzip
  python3 -m pip install --upgrade pip
  python3 -m pip install numpy pandas matplotlib seaborn scikit-learn scipy ipywidgets tqdm pillow requests ipykernel jupyterlab notebook
fi

if [ "$reboot_needed" = true ]; then
  echo "Reboot required, exiting with code 100 to indicate reboot."
  exit 100
fi

# Create venv and install kernel
python3 -m venv ~/venvs/sshkernel-env
source ~/venvs/sshkernel-env/bin/activate
pip install ipykernel
python -m ipykernel install --user --name=sshkernel-env --display-name "Python (Remote SSH Kernel)"

# Setup custom logo
echo "Setting up custom JupyterLab logo override..."

CUSTOM_LOGO_DIR=~/.jupyter/lab/user-settings/@jupyterlab/apputils-extension
mkdir -p "$CUSTOM_LOGO_DIR"

cat <<EOF > "$CUSTOM_LOGO_DIR/page_config.json"
{
  "logo": "/custom/dataspiresLogo.svg"
}
EOF

mkdir -p ~/jupyterlab-custom-assets

# Move the uploaded logo (assumes it's been SCP’d into ~/)
mv ~/dataspiresLogo.svg ~/jupyterlab-custom-assets/dataspiresLogo.svg

echo "c.ServerApp.extra_static_paths = ['~/jupyterlab-custom-assets']" >> ~/.jupyter/jupyter_server_config.py

notify_webapp
