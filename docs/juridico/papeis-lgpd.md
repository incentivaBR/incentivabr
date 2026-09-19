# Quem responde pelos dados: IncentivaBR e cliente white-label

Decisão tomada em setembro de 2026: **no site de um cliente, o cliente é o
controlador e a IncentivaBR é operadora.**

**Isto não é parecer jurídico.** É o desenho escolhido e o que o código faz
para sustentá-lo. O anexo de operador precisa ser escrito e revisto por
advogado antes do primeiro contrato.

## O desenho

| | Site da IncentivaBR | Site do cliente |
|---|---|---|
| Controlador (art. 5º, VI) | IncentivaBR | o cliente |
| Operador (art. 5º, VII) | — | IncentivaBR |
| Encarregado divulgado (art. 41 §1º) | o da IncentivaBR | **o do cliente** |
| Quem presta o serviço (Termos) | IncentivaBR | o cliente |
| De quem é a tecnologia | IncentivaBR | IncentivaBR |

O controlador decide as finalidades e responde ao titular e à ANPD. O operador
trata por conta e sob instruções do controlador, e responde ao controlador,
pelo contrato.

## Por que este e não outro

As alternativas consideradas foram controladoria conjunta (art. 42) e
separação por finalidade. Este desenho é o padrão de SaaS e é o que menos
expõe a IncentivaBR: ela não responde diretamente ao destinador do cliente.

O preço é uma disciplina que precisa ser mantida: **operador que decide
finalidade própria vira controlador de fato**, por mais que o contrato diga o
contrário. Decorre daí a decisão sobre a lista de avisos — ela é do cliente,
não da IncentivaBR. Captar leads no site do cliente para a base da plataforma
seria exatamente decidir finalidade própria sobre a base dele.

## O que o código faz

- `backend/src/lib/papeisLgpd.js` monta um objeto com controlador, operador,
  prestador, fornecedor, Encarregado e versão da Política.
- `GET /api/config/brand` devolve isso em `privacidade`.
- `frontend/js/tenant.js` escreve nos `[data-privacidade="…"]`, por
  `textContent`. Nenhuma página nomeia controlador à mão.
- A Política e os Termos trazem os dois lados, marcados com
  `data-so-plataforma` e `data-so-cliente`.
- Migration 041 dá `encarregado_nome` e `encarregado_email` à organização; a
  tela de clientes preenche.

Os Termos usam `prestador` e `fornecedor` em vez de `controlador` e
`operador`: eles falam de quem presta o serviço e de quem é a tecnologia, não
de dados. Chamar a associação de "controlador" numa cláusula de
responsabilidade seria a palavra errada no documento errado.

### A escada do Encarregado

Cliente sem Encarregado preenchido cai, nesta ordem, no contato da organização
e depois no Encarregado da IncentivaBR. A página nunca fica sem canal — uma
Política sem meio de exercer direitos é pior do que uma com o canal errado —
mas `encarregado_completo: false` marca que a reserva foi usada, e a tela de
clientes cobra. **Preencher antes de o cliente entrar no ar.**

## O que o contrato precisa dizer

O anexo de operador é o que sustenta o arranjo. No mínimo:

1. **Objeto e instruções.** A IncentivaBR trata os dados apenas para operar a
   plataforma, conforme instruções documentadas do cliente.
2. **Finalidades próprias, se houver.** Se a IncentivaBR usar qualquer dado
   para finalidade própria (métrica de produto, melhoria), isso tem de estar
   escrito — ou não pode acontecer.
3. **Suboperadores.** Railway (hospedagem), Resend (e-mail), bucket S3
   (documentos), Anthropic (TINA). Ver `mapa-de-dados-pessoais.md`: o mapa diz
   o que sai para cada um.
4. **Transferência internacional.** Resend e o bucket ficam fora do Brasil
   conforme a configuração. Arts. 33 a 36.
5. **Acesso do superadmin.** Alguém da IncentivaBR consegue ver que uma pessoa
   do cliente tem conta, e ver a lista de contas com CPF mascarado. Isso é
   inerente à operação e tem de estar nomeado, não descoberto depois.
6. **Incidentes.** Prazo e forma de comunicar o cliente (art. 48 — quem
   comunica à ANPD é o controlador).
7. **Fim do contrato.** O que acontece com os dados: devolução, eliminação,
   prazo. Inclui os documentos no bucket.
8. **Retenção.** Nada é apagado por prazo ainda; a regra de 24 meses dos
   interessados e a de cinco anos de quem destinou estão escritas e
   calculadas (`config/lgpd.js`), e `GET /api/admin/retencao` lista o que
   venceu. Falta o tributarista dizer de que data o prazo fiscal conta para
   o apagamento virar rotina.

## Pontas soltas, honestamente

- **Foro nos Termos.** A eleição de Brasília/DF ficou restrita ao site da
  IncentivaBR. Se um cliente quiser eleger foro, vira campo do cadastro. Hoje
  a página dele só diz que vale a lei brasileira.
- **A lista de avisos é do cliente, e ninguém consegue extraí-la.**
  `subscribers.organization_id` grava quem captou cada inscrição, mas não
  existe rota que liste — nem para o cliente, nem para o superadmin. A
  promessa "a lista é sua" está correta no dado e não entregável no produto.
  É a próxima coisa a construir nesta frente.
- **Expurgo por prazo não implementado.** Os direitos do titular, sim: quem
  tem conta exporta e elimina em `minha-conta.html` (set/2026), e a
  eliminação respeita a guarda fiscal. O que venceu o prazo é listado, não
  apagado, até o parecer do tributarista sobre a contagem.
- **Razão social e CNPJ do cliente** não aparecem nos documentos: as páginas
  mostram o nome fantasia do cadastro. Um contrato assinado provavelmente vai
  exigir a razão social completa na Política.

---

*Setembro de 2026. Muda quando o contrato mudar.*
