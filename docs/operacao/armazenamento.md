# Armazenamento dos documentos fiscais

Autor: Adacto Artur Dornas de Oliveira. Setembro de 2026.

Comprovante bancário do destinador e Recibo de Mecenato do proponente são os
dois documentos que a plataforma guarda. Até a Onda 1 eles ficavam no disco do
container da Railway, que é apagado a cada deploy (Raio-X, risco 02). Agora vão
para um object storage compatível com S3, com o SHA-256 gravado no banco.

## Como funciona

`backend/src/services/armazenamento.js` tem dois backends com a mesma interface:

| Backend | Quando | Onde grava |
|---|---|---|
| `s3` | `S3_BUCKET` definido | bucket S3-compatível (Cloudflare R2, AWS S3, Backblaze B2, MinIO) |
| `local` | sem `S3_BUCKET` | `backend/uploads/` (desenvolvimento e testes) |

Em produção com backend `local`, o boot avisa em vermelho e `/diagnostico`
marca `armazenamento: error`. O sistema continua funcionando, mas os arquivos
somem no próximo deploy. Não deixe assim.

Toda gravação devolve o hash do conteúdo, guardado em `donations.receipt_sha256`
e `donations.mecenato_sha256`. O download continua saindo pelas rotas
autenticadas (`/api/uploads/receipt/:id/arquivo`, `/api/mecenato/:id/arquivo`);
o bucket nunca é público.

O tipo do arquivo é decidido pelos primeiros bytes do conteúdo, não pela
extensão nem pelo MIME declarado. PDF renomeado de `.exe` não passa; PNG com
nome `.pdf` também não.

## Configurar (Cloudflare R2, recomendado)

R2 não cobra saída de dados e tem 10 GB gratuitos, o que cobre anos de
comprovantes de 5 MB.

1. Cloudflare → R2 → **Create bucket**. Nome sugerido: `incentivabr-documentos`.
   Localização: automática. Deixe o bucket privado (é o padrão).
2. R2 → **Manage R2 API Tokens** → Create API token. Permissão
   **Object Read & Write**, restrita a esse bucket. Guarde o *Access Key ID* e
   o *Secret Access Key*; o segredo só aparece uma vez.
3. Anote o endpoint S3 da conta: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   (aparece na página do bucket, em "S3 API").
4. Na Railway → serviço → Variables:

   ```
   S3_BUCKET=incentivabr-documentos
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```

5. Redeploy. Na subida, o servidor testa o bucket sozinho: grava um arquivo
   em `_diagnostico/`, lê de volta, confere o SHA-256 e apaga. Confira em
   `/diagnostico` (com o `DIAG_TOKEN`) que `services.armazenamento` está `ok`
   com `backend: s3` e `verificado: true`; sem o token, só o `status` aparece.
   Se a sonda falhar, o status vira `error` e o `aviso` traz o nome do erro do
   SDK: `InvalidAccessKeyId` ou
   `SignatureDoesNotMatch` é chave errada; `NoSuchBucket` é nome do bucket ou
   endpoint com o bucket no fim; `AccessDenied` é token sem permissão de
   escrita. O mesmo motivo sai no log da Railway, em vermelho.
6. Opcional: um upload de comprovante de teste, baixado pela tela de
   conferência, confirma o caminho completo pelo navegador.

Para AWS S3, troque o endpoint pela região (`S3_ENDPOINT` vazio,
`S3_REGION=sa-east-1`) e use um usuário IAM com `s3:PutObject`, `s3:GetObject`
e `s3:HeadObject` no bucket.

## Migrar arquivos antigos

`backend/scripts/migrar-uploads-para-storage.mjs` leva para o bucket o que
ainda estiver no disco e atualiza as linhas em `donations`. Ele só funciona
na máquina que tem os arquivos, ou seja, dentro do container em execução:

```bash
railway ssh
node scripts/migrar-uploads-para-storage.mjs --so-ver   # lista o que faria
node scripts/migrar-uploads-para-storage.mjs            # migra
```

Em setembro de 2026 é quase certo que não há nada a migrar: todo deploy
anterior já apagou o disco, e o sistema está em simulação. Linhas que apontam
para arquivos inexistentes aparecem no fim como "ausente"; o destinador precisa
reenviar o comprovante.

## O que ainda não existe

- Verificação do hash na hora do download (o hash está guardado; conferir
  exige ler o arquivo inteiro antes de enviar).
- Ciclo de vida: nada apaga documentos. A LGPD pede prazo de retenção definido;
  fica para quando houver política escrita.
- Backup do bucket. O R2 guarda com redundância, mas não substitui uma cópia
  em outro lugar; ver `docs/operacao/backup-restore.md`.
