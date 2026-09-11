# O que é da IncentivaBR e o que é do cliente

Um sistema só, dois papéis. A organização `www` é a IncentivaBR; qualquer
outra é um cliente white-label, com a marca, as cores, o projeto, os gestores
e os textos dele. Não há segundo repositório nem segundo deploy.

Este documento diz, página a página, de quem é cada coisa — e o que ainda
depende de decisão sua.

## Como a separação é feita, na prática

São três mecanismos, e só três:

| Mecanismo | Onde | Para quê |
|---|---|---|
| `data-tenant="…"` | HTML | troca o texto pelo do cliente (`hero_titulo`, `hero_subtitulo`, `sobre`, `contato_email`) |
| `data-so-plataforma` / `data-so-cliente` | HTML | esconde um trecho de um lado ou do outro |
| `PAGINAS_DA_PLATAFORMA` | `backend/src/lib/paginasDaPlataforma.js` | a página inteira não abre no domínio do cliente |

Os dois primeiros são aplicados por `frontend/js/tenant.js` no navegador. O
terceiro é conferido no servidor, antes de o arquivo sair daqui: esconder o
link não faz o endereço sumir, e quem digitasse o endereço veria a página
mesmo assim.

## Só da IncentivaBR

| O quê | Por quê |
|---|---|
| `para-associacoes.html` | é a carta de vendas do white-label: "por que sua associação deveria oferecer isso", "como funciona a parceria". No site do cliente, ofereceria ao público **dele** a tecnologia que ele já contratou |
| Cartão "Associação / ONG" na página inicial | o link para essa carta de vendas |
| Números do piloto (página inicial) | é a história da IncentivaBR, não a do cliente |
| Depoimentos "Servidores que já simularam" | são de servidores do DF que usaram o piloto em maio de 2026. Sob a marca do cliente passariam por depoimentos da base dele — e não são |
| `admin-clientes.html` | é onde a IncentivaBR cadastra e configura clientes. Já exige superadmin; não fica na lista de bloqueio para não trancar você fora dela por engano num domínio de cliente |

## Do cliente

| O quê | O que muda |
|---|---|
| `index.html` | título, subtítulo, "Quem somos", contato e o bloco do projeto dele vêm do cadastro |
| `projetos-rouanet.html` | mostra o projeto ativo da organização (`GET /api/salic/org-project`), não uma busca no SALIC |
| `destinar-rouanet.html` | a conta de captação é a do projeto do cliente, lida do banco |
| `conferencia.html` | fila dos gestores **dele** |
| Marca, cores e logo | `GET /api/config/brand`, por tenant |

## Serve aos dois (só a marca muda no topo)

`como-funciona.html`, `passo-a-passo.html`, `faq.html`, `calculadora.html`,
`guia-ir-servidor.html`, `biblioteca-juridica.html`, `agenda-fiscal.html`,
`espaco-contador.html`, `validador.html`.

É material de consulta sobre a lei e sobre o imposto. O conteúdo é o mesmo
para qualquer instituição; o que muda é o logotipo e a cor.

## O que ainda depende de decisão sua

Três pontos não têm resposta técnica — são de contrato:

1. **`cadastro-avisos.html`** — hoje a lista de avisos é uma só. Num cliente,
   quem se cadastra está entrando na lista de quem: da IncentivaBR ou dele?
2. **`termos-uso.html` e `politica-privacidade.html`** — os textos nomeiam a
   IncentivaBR. No site do cliente, ele é controlador dos dados dos
   destinadores e a IncentivaBR é operadora — ou o contrário? Isso precisa
   estar no contrato antes de a página ser reescrita.
3. **Registro INPI no rodapé** — o rodapé legal nomeia a IncentivaBR como
   fornecedora do programa. Isso é atribuição de software e está correto em
   qualquer deploy; fica registrado aqui porque é a pergunta que todo cliente
   faz.

## Como testar

Em desenvolvimento, `?org=<slug>` finge o domínio do cliente:

```
/index.html?org=casa-azul            → página do cliente
/para-associacoes.html?org=casa-azul → redireciona para /index.html?org=casa-azul
/index.html                          → página da IncentivaBR
```

Em produção a decisão vem do domínio: `custom_domain`, `admin_domain` ou
subdomínio (`casa-azul.incentivabr.com.br`).

## Como incluir uma página nova na separação

Uma linha em `PAGINAS_DA_PLATAFORMA`, em
`backend/src/lib/paginasDaPlataforma.js`. O teste
`backend/tests/separacao-white-label.test.mjs` confere que a página existe,
que ela é recusada no domínio do cliente e que a guarda continua rodando
antes dos arquivos estáticos — se ela passar para depois, o arquivo já teria
sido entregue e o bloqueio não valeria nada.
