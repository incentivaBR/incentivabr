# Portaria: o site fechado enquanto não abre

Enquanto a plataforma está em modo simulação e sem o parecer do tributarista,
o endereço não deve ficar aberto ao público. A portaria põe o site inteiro
atrás de uma senha, que você entrega a quem vai testar.

## Ligar

No painel da Railway, crie a variável:

```
SITE_SENHA = <uma frase longa, do gerenciador de senhas>
```

A Railway republica sozinha. A partir daí, quem abrir o endereço vê a janela
do navegador pedindo usuário e senha:

- **usuário:** qualquer coisa (não é conferido)
- **senha:** o valor de `SITE_SENHA`

Acertando uma vez, o navegador guarda um cookie e não pergunta de novo por
30 dias, naquele aparelho.

## Como saber se ela está ligada

Com a portaria ligada, **toda** página responde 401. De fora, isso é
indistinguível de site fora do ar — e foi o que aconteceu: "por que o domínio
caiu?" quando o domínio estava de pé, fechado por senha.

Dois endereços respondem isso sem senha:

```
/diagnostico   → "portaria": { "ligada": true, "explicacao": "fechada — …" }
/robots.txt    → "Disallow: /" quando fechada; erro 404 quando aberta
```

O `/diagnostico` nunca mostra a senha, nem o tamanho dela. Se `SITE_SENHA`
existir mas tiver só espaço, ele avisa: a senha é lida com `trim()`, então uma
variável só de espaço liga nada e o site segue aberto.

## Desligar

Apague a variável `SITE_SENHA` (ou deixe vazia). O site volta a ficar aberto,
que é o comportamento de sempre — a portaria não muda nada enquanto a
variável não existir.

## Trocar a senha

Basta mudar o valor. Todo cookie já entregue deixa de valer na hora, porque o
selo do cookie deriva da própria senha. Quem estava dentro precisa informar a
senha nova.

## O que fica de fora, e por quê

| Endereço | Por que não pede senha |
|---|---|
| `/health` | é por ele que a Railway sabe que o processo subiu. Atrás da senha, todo deploy seria marcado como falho |
| `/diagnostico` | é o que o monitor de uptime lê a cada 15 minutos. Atrás da senha, ele apitaria sem parar |
| `/robots.txt` | existe para os buscadores. Atrás da senha, nenhum o leria |

O `/diagnostico` continua mostrando só o resumo (banco, migrations,
armazenamento, e-mail, commit). O detalhe segue exigindo o cabeçalho
`x-diagnostico-token`.

## Buscadores

Com a portaria ligada, `/robots.txt` responde `Disallow: /` e o site não é
indexado. Desligada, o arquivo some e o site volta a ser indexável — assim
não sobra um bloqueio esquecido no dia da abertura.

Isso não desfaz indexação anterior. Se o endereço já tiver sido indexado,
peça a remoção no Google Search Console depois de ligar a portaria.

## O que a portaria NÃO faz

Ela controla **quem chega ao site**, não o que cada pessoa pode fazer lá
dentro. Quem tem a senha ainda precisa de conta para destinar, e de papel de
gestor ou superadmin para as telas de operação. São camadas diferentes:

1. portaria — quem alcança o endereço
2. conta — quem é a pessoa
3. papel — o que ela pode fazer

## Perder o acesso de superadmin

A tela de clientes exige superadmin, e criar um superadmin exigiria outro.
A porta de entrada é por variável, em `src/config/promoveSuperadmin.js`:

```
SUPERADMIN_EMAIL = seu@email
SUPERADMIN_SENHA = <senha nova>
```

No próximo boot a conta é promovida e a senha, redefinida. **Apague
`SUPERADMIN_SENHA` depois de entrar** — enquanto ela existir, todo deploy
volta a impor aquele valor e a senha não pode ser trocada pela tela.

Se você só esqueceu a senha e a conta já é superadmin, o caminho mais curto é
"Esqueceu sua senha?" na tela de entrar.
