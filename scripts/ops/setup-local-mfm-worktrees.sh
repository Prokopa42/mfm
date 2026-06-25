#!/usr/bin/env sh
set -eu

ROOT="/Users/Aleksey/Documents/Приложения"
SOURCE="$ROOT/МФМ"
PROKOPA="$ROOT/МФМ-ProKopa"
WIKMIKS="$ROOT/МФМ-Wikmiks"

echo "MFM local environment setup"
echo "source:  $SOURCE"
echo "prokopa: $PROKOPA"
echo "wikmiks: $WIKMIKS"

if [ ! -d "$SOURCE/.git" ]; then
  echo "ERROR: source repo is not a git repository: $SOURCE" >&2
  exit 1
fi

cd "$SOURCE"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: source working tree has uncommitted changes." >&2
  echo "Commit or stash the desired baseline before creating stable/dev worktrees." >&2
  git status --short
  exit 1
fi

if ! git show-ref --verify --quiet refs/heads/prokopa; then
  git branch prokopa
fi

if ! git show-ref --verify --quiet refs/heads/wikmiks-stable; then
  git branch wikmiks-stable
fi

if [ ! -d "$PROKOPA" ]; then
  git worktree add "$PROKOPA" prokopa
else
  echo "SKIP: ProKopa worktree already exists: $PROKOPA"
fi

if [ ! -d "$WIKMIKS" ]; then
  git worktree add "$WIKMIKS" wikmiks-stable
else
  echo "SKIP: Wikmiks worktree already exists: $WIKMIKS"
fi

echo
echo "Done. Next checks:"
echo "  cd '$PROKOPA' && git status --short --branch"
echo "  cd '$WIKMIKS' && git status --short --branch"
