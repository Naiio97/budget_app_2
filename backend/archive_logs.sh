#!/bin/bash
LOG_DIR="."
BACKUP_DIR="./logs"

mapfile -t files < <(find $LOG_DIR -name "*.log" -mtime +30)
count_start=${#files[@]}
if [ $count_start -gt 0 ]; then
   echo "Bude archivováno ${#files[@]} soubor/ů."
else
   echo "Žádné logy k archivaci"
   exit 0
fi

mkdir -p $BACKUP_DIR

for file in "${files[@]}"; do
  gzip "$file"
  mv "$file.gz" $BACKUP_DIR
done

mapfile -t files < <(find $LOG_DIR -name "*.log" -mtime +30)
count_end=${#files[@]}
if [ $count_end -eq 0 ]; then
    echo "Logy byly zálohovány do složky logs"
else
    echo "Nepovedlo se zálohovat $((count_start - count_end))"
fi
