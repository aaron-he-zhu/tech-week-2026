#!/usr/bin/env bash
set -euo pipefail

# Pin both the official release and its checksum; scan full Git history.
gitleaks_version=8.30.1
gitleaks_checksum=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
scan_dir=$(mktemp -d)
trap 'rm -rf "$scan_dir"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/gitleaks_${gitleaks_version}_linux_x64.tar.gz" \
  --output "$scan_dir/gitleaks.tar.gz"
printf '%s  %s\n' "$gitleaks_checksum" "$scan_dir/gitleaks.tar.gz" | sha256sum --check --status
tar -xzf "$scan_dir/gitleaks.tar.gz" -C "$scan_dir" gitleaks
"$scan_dir/gitleaks" git --redact --no-banner
