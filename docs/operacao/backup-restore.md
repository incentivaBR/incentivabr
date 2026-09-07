# Backup, restore e monitor

Autor: Adacto Artur Dornas de Oliveira. Setembro de 2026.

O Raio-X registrou "nenhum script de backup, restore pendente, sem monitor de
uptime, sem alerta" (risco 09). Este documento descreve o que passou a existir
e o que ainda depende de configuração no painel.

## Backup diário do Postgres

`.github/workflows/backup.yml` roda `scripts/backup-postgres.sh` todo dia às
03:00 UTC (meia-noite em Brasília) e pode ser disparado à mão em Actions.

O que o script faz:

1. `pg_dump --format=custom` do banco de produção (pela URL pública da Railway).
2. Cifra o arquivo com `gpg` (AES-256, senha em `BACKUP_PASSPHRASE`). O dump
   tem CPF, nome e e-mail de servidor público; não sai do runner sem cifrar.
3. Envia para o bucket S3-compatível (o mesmo R2 dos documentos), prefixo
   `backups/`, junto com o SHA-256.
4. Apaga do bucket os dumps com mais de 30 dias.

O dump nunca vai para artifact do GitHub: em repositório público, artifacts
são baixáveis.

### Segredos a cadastrar (GitHub → Settings → Secrets and variables → Actions)

| Segredo | De onde vem |
|---|---|
| `DATABASE_PUBLIC_URL` | Railway → Postgres → Variables → `DATABASE_PUBLIC_URL` (a interna não resolve fora da rede deles) |
| `BACKUP_PASSPHRASE` | gere uma frase longa (`openssl rand -base64 32`) e **guarde fora do GitHub também**: sem ela o backup é ilegível |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | os mesmos de `docs/operacao/armazenamento.md` |

Se um segredo faltar, o job falha e o GitHub avisa por e-mail. É o
comportamento desejado: backup que falha em silêncio não é backup.

Depois de cadastrar, dispare o workflow uma vez à mão (Actions → Backup do
Postgres → Run workflow) e confira no bucket o arquivo
`backups/incentivabr-AAAA-MM-DD-HHMM.dump.gpg`.

## Restore

`scripts/restaurar-postgres.sh` decifra e restaura um dump num banco de
destino, depois imprime a contagem das tabelas principais e a última migration,
para comparar com a origem.

```bash
# baixando do bucket
BACKUP_PASSPHRASE=... DATABASE_URL=postgres://.../destino \
S3_BUCKET=... S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  scripts/restaurar-postgres.sh --do-bucket incentivabr-2026-09-06-0300.dump.gpg

# de um arquivo local
BACKUP_PASSPHRASE=... DATABASE_URL=postgres://.../destino \
  scripts/restaurar-postgres.sh backups/incentivabr-2026-09-06-0300.dump.gpg
```

Regras:

- **Versão do cliente.** `pg_dump` e `pg_restore` precisam ser da mesma
  versão do servidor ou mais novos. O Postgres da Railway está no 18 em
  setembro de 2026; o workflow pergunta a versão ao servidor e instala o
  cliente correspondente. Para restaurar na sua máquina, instale o
  `postgresql-client-18` (ou mais novo) antes, senão o `pg_restore` recusa
  o arquivo.
- **Nunca aponte para o banco de produção sem ter certeza.** O restore usa
  `--clean --if-exists`: apaga e recria as tabelas do dump.
- Para testar um backup, restaure num banco novo (na Railway, um segundo
  serviço Postgres temporário; localmente, `createdb teste`) e compare as
  contagens com a produção.
- Para voltar a produção para um ponto anterior: pare o serviço na Railway,
  restaure, suba de novo. As migrations que vieram depois do dump rodam no
  boot seguinte, na ordem.

## Restore executado em 6 de setembro de 2026

Feito num Postgres 16 local, com o banco criado pela cadeia completa de
migrations e três linhas inseridas (organização, usuário, destinação).

```
=== BACKUP
== pg_dump (2026-09-06T23:48:18Z)
   incentivabr-2026-09-06-2348.dump: 87874 bytes
== cifrando
   incentivabr-2026-09-06-2348.dump.gpg sha256=a5abf029…254007
== ok

=== RESTORE (em banco vazio "destino")
== decifrando
== pg_restore em postgres://postgres:***@127.0.0.1:54329/destino
   pg_restore sem avisos
== conferência
users: 1
donations: 1
organizations: 2
org_projects: 1
ultima migration: 035_remove_usuarios_de_teste.sql
== ok

=== ORIGEM
users: 1
donations: 1
organizations: 2
org_projects: 1
ultima migration: 035_remove_usuarios_de_teste.sql
```

Comparação dos esquemas (`pg_dump --schema-only`) de origem e destino: sem
diferença além da forma como o Postgres imprime as constraints `CHECK`
(`ARRAY[...]::text[]` contra `ARRAY[(...)::text]`, o mesmo significado).

## Primeiro backup de produção: 7 de setembro de 2026

Segredos cadastrados no GitHub e workflow disparado à mão. Os dois primeiros
disparos falharam e corrigiram o script (PRs #15 e #16): o runner trazia o
`pg_dump` 16 contra um servidor 18, e a `aws cli` recusava o `.sha256` vindo
de um pipe. O terceiro disparo passou de ponta a ponta:

```
== pg_dump (2026-09-07T12:12:13Z)
   incentivabr-2026-09-07-1212.dump: 112323 bytes
== cifrando
   incentivabr-2026-09-07-1212.dump.gpg sha256=3dc1ddf3…9dec1
== enviando para s3://<bucket>/backups/
== retenção: apagando dumps com mais de 30 dias
== no bucket agora:
2026-09-07 12:09:50   39735 incentivabr-2026-09-07-1209.dump.gpg
2026-09-07 12:12:20     103 incentivabr-2026-09-07-1212.dump.gpg.sha256
2026-09-07 12:12:19   39732 incentivabr-2026-09-07-1212.dump.gpg
== ok
```

O dump das 12:09 é do segundo disparo, que subiu o arquivo mas não o
`.sha256`; a retenção o apaga em 30 dias. A partir daqui o cron roda todo dia
às 03:00 UTC.

Ainda não executado: restore de um dump vindo do bucket de produção. Precisa
de alguém com a `BACKUP_PASSPHRASE` e as chaves do bucket, num banco
temporário (`scripts/restaurar-postgres.sh --do-bucket <arquivo>`), com
`pg_restore` 18 ou mais novo. Anote aqui a data quando fizer.

## Monitor de disponibilidade

`.github/workflows/uptime.yml` chama, a cada 15 minutos:

- `GET /health`: precisa responder 200 (três tentativas);
- `GET /diagnostico` (parte pública, sem token): falha se qualquer serviço
  (`database`, `migrations`, `email`, `armazenamento`, `assistente`) estiver
  em `error`.

Job que falha gera e-mail do GitHub para o dono do repositório. É um alerta
mínimo, com limites que precisam ser ditos:

- o cron do GitHub atrasa minutos e às vezes pula execuções;
- não cobre erro 5xx em rotas específicas (só o que `/diagnostico` enxerga);
- não mede tempo de resposta nem avisa por SMS ou WhatsApp.

Para alerta de verdade, um monitor externo gratuito (UptimeRobot ou Better
Stack) apontado para `https://www.incentivabr.com.br/health`, com intervalo
de 1 a 5 minutos e aviso por e-mail e app, complementa isto. Leva dez minutos
para configurar e não depende do repositório.

## O que ainda não existe

- Backup do bucket de documentos (comprovantes e recibos). O R2 replica
  internamente, mas não é cópia em outro lugar. Opção simples: um segundo
  passo no mesmo workflow copiando `receipts/` e `mecenato/` para um segundo
  bucket ou provedor.
- Teste periódico de restore. O certo é restaurar um dump por mês num banco
  temporário e registrar aqui.
- Alerta de erro 5xx pela aplicação (log drain da Railway para um serviço de
  observabilidade). Fica para quando houver volume.
