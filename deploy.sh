#!/bin/bash -eu

npm run build

host=$(echo "$1" | cut -d: -f1)
directory=$(echo "$1" | cut -d: -f2)
rsync -avz ./*.json "$1"/
rsync -avz ./build/ "$1"/build/
rsync -avz ./resources/ "$1"/resources/

# register service
ssh "$host" <<EOF
source .nvm/nvm.sh
export NODE_PATH=\$(dirname \$(which node))
export PROJECT_DIR=\$(readlink -f ${directory})
export SLACKBOT_INCOMING_WEBHOOK=${SLACKBOT_INCOMING_WEBHOOK:-}
(cd \${PROJECT_DIR} && npm install --production)
mkdir -p \${HOME}/.config/systemd/user/
envsubst < ./${directory}/resources/microbit.service.template > \${HOME}/.config/systemd/user/microbit.service
systemctl --user daemon-reload
systemctl --user enable microbit
systemctl --user restart microbit
EOF
