# Nota técnica de pesquisa — IRPF e incentivos fiscais (setembro de 2026)

> **ISTO NÃO É UM PARECER.** Documento de pesquisa, sem assinatura de advogado
> tributarista e sem responsabilidade técnica. Não é oponível em defesa
> administrativa, não fundamenta orientação a cliente e não autoriza mudar
> teto de dedução no sistema.
>
> Está aqui por um motivo só: registrar de onde vieram as correções da
> **migration 045** e das páginas `biblioteca-juridica.html`, `validador.html`,
> `espaco-contador.html` e `agenda-fiscal.html`. Quando o parecer assinado
> chegar, ele substitui este arquivo.

## O que esta nota resolveu

Sete das onze perguntas de `CONSULTA-TRIBUTARISTA.md` deixaram de precisar de
hora de tributarista. Três correções vieram dela, e as três estavam erradas no
produto:

| Ponto | O que o sistema dizia | O que a pesquisa apurou | Onde foi corrigido |
|---|---|---|---|
| PRONON e PRONAS/PCD | compartilham 1% do IR devido | **1% para cada**, independentes, fora do teto geral | quatro páginas, `nucleo.md`, migration 045 |
| Incentivo ao esporte | concorre dentro dos 6% | concorre, mas a **LC 222/2025 eleva o conjunto a 7%** | texto das páginas e migration 045 — **não o cálculo** |
| Recicla+ | limite de 6%, enquadramento indefinido | 100% dedutível, **dentro** do teto geral, não autônomo | migration 045 |

O erro do PRONON/PRONAS é o que mais importa: estava no ar, em quatro páginas,
na base da TINA e **no cálculo do validador**, que somava as duas destinações
contra um único 1% e acusava excesso onde a lei permite o dobro.

## O que a nota confirmou, sem mudar nada

Perguntas 2, 5, 6, 8, 10 e 11: a leitura que o sistema já operava.

A 11 é a que vale dinheiro — confirma que FDCA e Fundo do Idoso são dedutíveis
até 6% **durante o ano-calendário**, no teto compartilhado com a Rouanet, e que
os 3% do art. 260-A do ECA são a via separada de destinar na própria
declaração. É exatamente o que a migration 044 corrigiu.

## O que continua aberto

1. **Os 3% do art. 260-A** (pergunta 7). A nota responde de forma
   explicitamente insegura — "não é juridicamente seguro apresentar", "leitura
   operacional prudente". Não resolveu.
2. **Vigência do PRONON e do PRONAS/PCD** para pessoa física depois do
   ano-calendário de 2025. A Lei 12.715/2012 autorizava até lá; há notícia de
   projeto estendendo a 2029, sem confirmação de que virou lei.
3. **Fichas e códigos da DIRPF** (pergunta 10). A nota recomenda não fixar, e
   concordamos: seguem marcados como não confirmados.
4. **Retenção do registro fiscal** (pergunta 9). Ver abaixo.

## Onde não seguimos a recomendação

**O teto de 7% não entrou no cálculo.** A nota o apresenta como a leitura mais
aderente ao texto legal, e provavelmente está certa — mas aplicar exige lógica
condicional em `saldoDisponivel()` (6% sem esporte, 7% com), e não se escreve
regra fiscal nova sobre documento não assinado. Manter 6% erra para menos: o
servidor destina abaixo do que podia e recupera no ano seguinte. O inverso o
joga na malha fina, e isso não se desfaz. Nenhum cliente opera esporte hoje.

**A nota se contradiz sobre o Recicla+.** Na tabela do item 1 o coloca no bloco
de 6%; no item 4 diz que com esporte integra o bloco de 7% por "interpretação
sistemática mais consistente" — e ela mesma marca isso como interpretação, não
como texto legal. Não foi codificado.

**Sobre a retenção (pergunta 9),** a regra que a nota recomenda — ano-base + 6,
até 31 de dezembro — é *numericamente idêntica* à que `config/lgpd.js` já usa
(`ano-base + 1 + 5`). O que ela acrescenta de real é a trava de litígio e a
eliminação do identificável em vez da anonimização ao fim do prazo. Tratado à
parte.

## Como as afirmações foram conferidas

O texto legal **não foi lido**: o ambiente onde esta revisão foi feita não
alcança o `planalto.gov.br`. Os dois pontos que mudaram o produto foram
conferidos em fontes secundárias:

- **7% conjunto do esporte (LC 222/2025):** [Senado
  Notícias](https://www12.senado.leg.br/noticias/materias/2025/11/27/lei-de-incentivo-ao-esporte-se-torna-politica-permanente)
  e [Mattos Filho](https://www.mattosfilho.com.br/unico/lei-incentivo-esporte-permanente/).
- **1% para cada programa, e a vigência até 2025:** [Instituto
  Oncoguia](https://www.oncoguia.org.br/painel-politicas-publicas/aprovada-deducao-do-ir-por-doacoes-a-programas-de-saude-ate-2025/)
  e [Câmara dos
  Deputados](https://www.camara.leg.br/noticias/1153125-comissao-aprova-projeto-que-prorroga-deducao-do-ir-para-doacoes-a-programas-de-saude/).

Por isso tudo o que entrou nas páginas está marcado como **não confirmado em
fonte primária**, do mesmo jeito que os códigos da DIRPF.
