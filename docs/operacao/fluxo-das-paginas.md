# O fluxo das páginas

Quais são as 34 páginas, quem entra em cada uma e por onde se chega. Levantado
em setembro de 2026 lendo os links de verdade entre os arquivos, não a memória
de quem escreveu.

O que este documento serve para decidir: o que é fluxo principal, o que é
material de apoio, e o que não pertence a fluxo nenhum.

## Os quatro fluxos

### 1. Destinador — do interesse ao recibo

É o fluxo que justifica o produto. Sete telas:

```
index.html
   ↓  "Calcular quanto posso destinar"
calculadora.html            ← quanto o IR devido permite destinar
   ↓
projetos-rouanet.html       ← o projeto do tenant (SALIC)
   ↓
login.html                  ← cria conta (e-mail e senha; sem CPF)
   ↓
destinar-rouanet.html       ← assistente: valor, CPF, conta de captação, comprovante
   ↓
dashboard.html              ← acompanha; recebe o Recibo de Mecenato
```

Fora da linha, mas dentro do fluxo: `minha-conta.html` (os direitos de quem
tem conta — LGPD art. 18: ver, baixar em JSON, eliminar com a senha; chega
pelo painel), `minhas-preferencias.html` (o mesmo para quem só recebe avisos,
chega pelo link de cada mensagem) e `verificar-email.html` (chega por link no
e-mail).

**A calculadora não exige conta e não grava nada.** É a porta mais larga do
funil e a que menos pede em troca.

### 2. Gestor do proponente — conferir o que entrou, e falar com quem se interessou

```
login.html → dashboard.html → conferencia.html
                            → interessados.html
```

Os dois atalhos só acendem quando a rota respectiva responde 200
(`GET /api/donations/conferencia`, `GET /api/interessados/lista`). Quem decide
é a rota; a tela não guarda cópia da regra.

`interessados.html` é a lista de quem se cadastrou para receber avisos pelo
site da organização — a lista é dela. Mostra a situação de cada pessoa
(ativo, pendente, revogado) e exporta CSV por rota autenticada.

`aceitar-convite.html` é como um gestor entra pela primeira vez — chega por
link no e-mail do convite.

### 3. Superadmin IncentivaBR — operar a plataforma

```
login.html → dashboard.html → admin-clientes.html
```

Mesma mecânica: o atalho acende quando `GET /api/admin/orgs` responde 200.

### 4. Público — entender antes de decidir

Nove páginas de consulta, alcançáveis pelo menu e umas pelas outras:

| Página | Para quem |
|---|---|
| `como-funciona.html` | quem nunca ouviu falar em Lei Rouanet |
| `passo-a-passo.html` | quem já entendeu e quer o passo a passo |
| `faq.html` | dúvidas soltas |
| `guia-ir-servidor.html` | como declarar a destinação na DIRPF |
| `biblioteca-juridica.html` | a lei, os decretos, as instruções normativas |
| `agenda-fiscal.html` | prazos do ano |
| `espaco-contador.html` | o contador do destinador |
| `validador.html` | conferir se a destinação está correta |
| `cadastro-avisos.html` | receber aviso de prazo sem criar conta |

Todas servem tanto à IncentivaBR quanto a um cliente: o conteúdo é sobre a lei
e sobre o imposto, e só a marca muda no topo. Ver
`separacao-white-label.md`.

## As páginas que chegam por e-mail

Não têm link em lugar nenhum, e é assim que tem de ser: quem abre essas
páginas chegou por um link com token.

| Página | Vem de |
|---|---|
| `verificar-email.html` | confirmação do endereço, no cadastro |
| `redefinir-senha.html` | "esqueci minha senha" |
| `aceitar-convite.html` | convite para ser gestor de uma organização |
| `confirmar-cadastro.html` | duplo opt-in da lista de avisos |

## Os nove atalhos de endereço

Páginas de uma linha, que só redirecionam. Existem para não quebrar endereço
que já circulou em apresentação, e-mail ou material impresso:

| Atalho | Vai para |
|---|---|
| `calculadora-escolha.html`, `calculadora-rapida.html` | `calculadora.html` |
| `projetos.html`, `campanha.html` | `projetos-rouanet.html` |
| `piloto.html`, `piloto-start.html`, `impacto.html` | `index.html` |
| `privacidade.html` | `politica-privacidade.html` |
| `termos.html` | `termos-uso.html` |

São 9 arquivos de manutenção quase zero. O custo de mantê-los é menor que o de
descobrir, depois, qual apresentação impressa apontava para qual.

## Só da IncentivaBR

`para-associacoes.html` — a carta de vendas do white-label. Recusada no
servidor quando o domínio é de um cliente
(`backend/src/lib/paginasDaPlataforma.js`).

## Documentos legais

`termos-uso.html` e `politica-privacidade.html`, com as cláusulas que mudam
conforme o site seja da IncentivaBR ou de um cliente. Ver
`docs/juridico/papeis-lgpd.md`.

## O que o levantamento mostrou

**Nenhuma página órfã de verdade.** Todas as 34 estão em um dos grupos acima:
fluxo, apoio, e-mail, atalho ou legal. As que não recebem link ou chegam por
e-mail com token, ou são atalho de endereço.

**O dashboard é o eixo.** É de lá que gestor e superadmin alcançam as telas de
operação, e o acesso é sempre decidido pela rota, nunca por uma cópia da regra
na tela. Qualquer tela de operação nova entra por ali.

**A tela da lista entrou por esse padrão.** `GET /api/interessados/lista`
existiu um dia sem tela; `interessados.html` chega por atalho no dashboard,
aceso pela resposta da rota, como as outras duas telas de operação.

---

*Setembro de 2026. Refazer o levantamento quando entrar página nova:*
*os links são a fonte, não este texto.*
