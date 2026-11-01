# TODO — IncentivaBR Rouanet

## Em andamento
- [x] Adaptar `server.js` para remover rotas GDF — removidos `projectsRoutes` e `organizationsRoutes` (tabelas GDF inexistentes neste DB)
- [x] Adaptar `backend/package.json` (nome: `incentivabr-rouanet`) — já estava correto
- [x] Revisar `frontend/index.html` — sem referências GDF/FDI/FDCA
- [x] Revisar `frontend/dashboard.html` — removido link morto para `admin.html` (Painel do Fundo)
- [x] Parametrizar brand no frontend via `/api/config/brand` — adicionado `loadBrand()` em `tenant.js`

## Próximas tarefas
- [x] Criar `.env.example` completo — adicionado `SIMULATION_MODE` e `ANTHROPIC_API_KEY`
- [x] Testar fluxo completo: busca SALIC → wizard → comprovante — testado em prod (2026-05-04)
- [x] Configurar deploy na Railway com nixpacks — Railway detecta automaticamente
- [x] `SIMULATION_MODE=true` na Railway — ativo para piloto FGV
- [ ] Criar README.md comercial (para clientes white-label)
- [ ] Subdomínio `destinai.com.br` apontando para o deploy

## Conformidade com o Manual de Uso da Marca do PRONAC (jan/2026)

Achado em 1/nov/2026, lendo o manual oficial. **O site do cliente é uma peça de
divulgação de projeto da Lei Rouanet, e hoje não cumpre três exigências.**

- [ ] **Bloco de marcas no rodapé da página inicial do cliente.** O manual (p. 6)
  determina que os projetos viabilizados pelo PRONAC "devem exibir a marca da Lei
  Rouanet, a assinatura do Ministério da Cultura e a marca do Governo Federal", e
  (p. 12) para produtos digitais diz, literalmente: *"Em sites, optar para inserir
  a marca abrindo o bloco de marcas, no rodapé da página inicial."* O nosso rodapé
  (`frontend/js/layout.js`, `dai-footer__inner`) tem a logo da IncentivaBR, os
  links e o aviso legal — e nenhuma das três marcas.
- [ ] **A expressão "Ministério da Cultura apresenta".** O manual (p. 7): *"Todos
  os projetos que estão sob a Lei Rouanet devem conter a expressão 'Ministério da
  Cultura apresenta'"*, com regra de construção — "Ministério da Cultura" sempre
  em primeiro lugar, seguido das outras instituições:
  `Ministério da Cultura, ___, ___ e ___ apresenta(m)`. Vale para mídias digitais
  (p. 8). Não existe em página nenhuma.
- [ ] **Ordem das marcas.** A inserção segue ordem ascendente de importância da
  esquerda para a direita, e a marca do Governo Federal é sempre a última à
  direita (p. 15 e 19).

**O que trava:** os arquivos oficiais das marcas estão em `gov.br/leirouanet`, que
o ambiente de trabalho não alcança. Precisam ser baixados de lá — nunca
redesenhados.

**E há um passo de processo que não é de código** (manual, p. 2): *"Todas as peças
criadas para divulgação dos projetos culturais que estão sob a Lei Rouanet devem
ser enviadas via sistema Salic para aprovação prévia."* Ou seja, a página
white-label de cada cliente passa por aprovação prévia no SALIC antes de ir ao ar.
Isso entra no cronograma de implantação.

**Só vale para cliente da Rouanet.** O mecanismo já é dado por tenant
(`organizations.incentive_group_code`), então o bloco é condicional, não fixo — um
cliente de FDCA não exibe marca do PRONAC.

**O Módulo de Avaliação de Resultados**, citado pelo Módulo 2 como fonte da
comprovação física, **não está publicado no site do MinC** (conferido por Adacto
em 1/nov/2026). Não há o que consultar até que saia.

## Backlog
- [ ] Página de onboarding para novos clientes white-label
- [ ] Painel admin simplificado (só doações Rouanet)
- [ ] Webhook para notificar organização a cada nova destinação
- [ ] Relatório PDF mensal de destinações por PRONAC
