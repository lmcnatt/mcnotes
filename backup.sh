#!/bin/bash
# Backup script for Mcnatt Notes & Codebase

echo "=== Backing up Notes ==="
cd /mnt/mcnatt-storage/notes
git add .
if ! git diff-index --quiet HEAD --; then
  git commit -m "Auto-backup: $(date)"
  git push origin main
  echo "Notes backed up successfully."
else
  echo "No changes in notes to back up."
fi

echo "=== Backing up Codebase ==="
cd /home/logan/notes
git add .
if ! git diff-index --quiet HEAD --; then
  git commit -m "Auto-backup: $(date)"
  git push origin main
  echo "Codebase backed up successfully."
else
  echo "No changes in codebase to back up."
fi
