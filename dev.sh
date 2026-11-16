#!/usr/bin/env bash
set -Eeuo pipefail

root_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$root_dir"

# Select an installed Node 24 when nvm is available and the current Node is too old.
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')
if (( node_major < 24 )) && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
	# shellcheck source=/dev/null
	source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
	nvm use 24 || true
fi

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')
if (( node_major < 24 )); then
	printf '%s\n' 'Node.js 24 or newer is required. Install it or run: nvm install 24' >&2
	exit 1
fi

export PATH="${GOPATH:-$HOME/go}/bin:$PATH"
if ! command -v go >/dev/null; then
	printf '%s\n' 'Go is required. Install Go (see go.mod for the required version), then install Mage: go install github.com/magefile/mage@v1.17.2' >&2
	exit 1
fi
if ! command -v mage >/dev/null; then
	printf '%s\n' 'Mage is required. Install it with: go install github.com/magefile/mage@v1.17.2' >&2
	exit 1
fi

if command -v pnpm >/dev/null; then
	pnpm_cmd=(pnpm)
elif command -v corepack >/dev/null; then
	pnpm_cmd=(corepack pnpm)
else
	printf '%s\n' 'pnpm is required. Enable Corepack or install the pnpm version in frontend/package.json.' >&2
	exit 1
fi

frontend_port=${VIKUNJA_FRONTEND_PORT:-4173}
backend_url=${DEV_PROXY:-http://127.0.0.1:3456}
export VIKUNJA_SERVICE_PUBLICURL=${VIKUNJA_SERVICE_PUBLICURL:-http://127.0.0.1:${frontend_port}/}
export DEV_PROXY=$backend_url

if [[ ! -x frontend/node_modules/.bin/vite ]]; then
	printf '%s\n' 'Installing frontend dependencies...'
	(cd frontend && "${pnpm_cmd[@]}" install --frozen-lockfile)
fi

printf '%s\n' 'Building the backend...'
mage build

backend_pid=
frontend_pid=
cleanup() {
	trap - EXIT INT TERM
	[[ -z $backend_pid ]] || kill "$backend_pid" 2>/dev/null || true
	[[ -z $frontend_pid ]] || kill "$frontend_pid" 2>/dev/null || true
	wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

./vikunja web &
backend_pid=$!
(cd frontend && exec "${pnpm_cmd[@]}" dev) &
frontend_pid=$!

printf '\nFrontend: http://127.0.0.1:%s\nPress Ctrl+C to stop both servers.\n' "$frontend_port"
wait -n "$backend_pid" "$frontend_pid"
