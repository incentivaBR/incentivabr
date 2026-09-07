#!/usr/bin/env bash
#
# Backup do Postgres de produção: pg_dump em formato custom, cifrado, enviado
# para o bucket S3-compatível (o mesmo R2 dos documentos, prefixo backups/).
#
# Roda todo dia pelo .github/workflows/backup.yml, e pode rodar à mão.
#
# Variáveis:
#   DATABASE_URL         obrigatória. Na Railway, use a URL PÚBLICA do Postgres
#                        (DATABASE_PUBLIC_URL), a interna só resolve dentro da rede deles.
#   BACKUP_PASSPHRASE    obrigatória. O dump tem CPF, nome e e-mail de servidor
#                        público; não sai daqui sem cifrar (gpg simétrico, AES-256).
#   S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
#                        destino. Sem S3_BUCKET, o arquivo fica só em DESTINO.
#   DESTINO              pasta local (padrão: ./backups)
#   RETENCAO_DIAS        apaga do bucket dumps mais velhos que isto (padrão: 30)
#
# Saída: <DESTINO>/incentivabr-<AAAA-MM-DD-HHMM>.dump.gpg e, com bucket,
# s3://<bucket>/backups/<mesmo nome>. Imprime o SHA-256 do arquivo cifrado.
#
# Restaurar: scripts/restaurar-postgres.sh (leia docs/operacao/backup-restore.md antes).

set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE — o dump tem dados pessoais e não sai sem cifrar}"
DESTINO="${DESTINO:-./backups}"
RETENCAO_DIAS="${RETENCAO_DIAS:-30}"

for cmd in pg_dump gpg sha256sum; do
  command -v "$cmd" >/dev/null || { echo "faltou $cmd" >&2; exit 1; }
done

mkdir -p "$DESTINO"
CARIMBO="$(date -u +%Y-%m-%d-%H%M)"
NOME="incentivabr-${CARIMBO}.dump"
BRUTO="$DESTINO/$NOME"
CIFRADO="$BRUTO.gpg"

echo "== pg_dump ($(date -u +%FT%TZ))"
# -Fc: formato custom, comprimido, restaurável seletivamente com pg_restore.
# --no-owner/--no-acl: o banco de destino pode ter outro usuário.
pg_dump --format=custom --no-owner --no-acl --file="$BRUTO" "$DATABASE_URL"
TAMANHO=$(stat -c %s "$BRUTO")
echo "   $NOME: $TAMANHO bytes"

echo "== cifrando"
gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_PASSPHRASE" --output "$CIFRADO" "$BRUTO"
rm -f "$BRUTO"
SHA=$(sha256sum "$CIFRADO" | cut -d' ' -f1)
echo "   $(basename "$CIFRADO") sha256=$SHA"
# No formato que `sha256sum -c` lê (o restore confere com ele). Vai para o
# disco antes de subir: a aws cli recusa pipes e /dev/fd.
echo "$SHA  $(basename "$CIFRADO")" > "$CIFRADO.sha256"

if [ -n "${S3_BUCKET:-}" ]; then
  : "${S3_ACCESS_KEY_ID:?}"; : "${S3_SECRET_ACCESS_KEY:?}"
  command -v aws >/dev/null || { echo "faltou aws cli para enviar ao bucket" >&2; exit 1; }
  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${S3_REGION:-auto}" AWS_EC2_METADATA_DISABLED=true
  EP=(); [ -n "${S3_ENDPOINT:-}" ] && EP=(--endpoint-url "$S3_ENDPOINT")

  echo "== enviando para s3://$S3_BUCKET/backups/"
  aws s3 cp "${EP[@]}" --only-show-errors "$CIFRADO" "s3://$S3_BUCKET/backups/$(basename "$CIFRADO")"
  aws s3 cp "${EP[@]}" --only-show-errors "$CIFRADO.sha256" "s3://$S3_BUCKET/backups/$(basename "$CIFRADO").sha256"

  echo "== retenção: apagando dumps com mais de $RETENCAO_DIAS dias"
  LIMITE=$(date -u -d "-${RETENCAO_DIAS} days" +%Y-%m-%d)
  aws s3 ls "${EP[@]}" "s3://$S3_BUCKET/backups/" | awk '{print $4}' | grep -E '^incentivabr-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}\.dump\.gpg(\.sha256)?$' | while read -r arq; do
    DIA=$(echo "$arq" | sed -E 's/^incentivabr-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')
    if [[ "$DIA" < "$LIMITE" ]]; then
      aws s3 rm "${EP[@]}" --only-show-errors "s3://$S3_BUCKET/backups/$arq"
      echo "   apagado: $arq"
    fi
  done
  echo "== no bucket agora:"
  aws s3 ls "${EP[@]}" "s3://$S3_BUCKET/backups/" | tail -n 5
fi

echo "== ok: $CIFRADO"
