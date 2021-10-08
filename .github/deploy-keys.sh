#!/bin/sh
# (Re-)generate all deploy keys on https://github.com/cockpit-project/cockpit-machines/settings/environments

set -eux

ORG=cockpit-project
THIS=cockpit-machines

[ -e bots ] || make bots

# for workflows pushing to our own repo: npm-update.yml and weblate-sync-po.yml
bots/github-upload-secrets --receiver "${ORG}/${THIS}" --env self --ssh-keygen DEPLOY_KEY --deploy-to "${ORG}/${THIS}"

# for weblate-sync-pot.yml: push to https://github.com/cockpit-project/cockpit-machines-weblate/settings/keys
bots/github-upload-secrets --receiver "${ORG}/${THIS}" --env "${THIS}-weblate" --ssh-keygen DEPLOY_KEY --deploy-to "${ORG}/${THIS}-weblate"

# for {publish,prune}-dist.yml: push to https://github.com/cockpit-project/cockpit-machines-dist/settings/keys
bots/github-upload-secrets --receiver "${ORG}/${THIS}" --env "${THIS}-dist" --ssh-keygen DEPLOY_KEY --deploy-to "${ORG}/${THIS}-dist"
