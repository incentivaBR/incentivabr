-- 045 — O catálogo depois da nota técnica de pesquisa
--
-- ORIGEM DESTA MIGRATION
--
-- Uma nota técnica de PESQUISA (não assinada, não é parecer) revisou as onze
-- perguntas de docs/juridico/CONSULTA-TRIBUTARISTA.md. Ela está arquivada em
-- docs/juridico/nota-tecnica-pesquisa-2026-09.md com a ressalva no topo.
--
-- Nada aqui marca `confirmado_por_parecer = TRUE`. Nada aqui libera mecanismo
-- para cliente. O que muda é CADASTRO: onde o catálogo afirmava algo que as
-- fontes contradizem, passa a dizer o certo ou a dizer que não sabe.
--
-- É a mesma lição da 031 e da 044: o cálculo pode estar certo por acaso
-- enquanto o cadastro mente, e aí o cadastro vira comportamento no dia em que
-- alguém confiar nele para configurar um mecanismo novo.
--
-- O QUE A NOTA CORRIGIU, E O QUE CONTINUA ABERTO
--
--   1. Esporte — a LC 222/2025 revogou a Lei 11.438/2006 e fixa, para pessoa
--      física, 7% do imposto devido EM CONJUNTO com os incisos I a III do
--      art. 12 da Lei 9.250/1995. Não é "6% para cultura + 7% para esporte":
--      é a cesta inteira subindo de 6% para 7% quando o esporte entra.
--
--   3. PRONON e PRONAS/PCD — 1% para CADA, não 1% dividido entre os dois. O
--      site e a base da TINA afirmavam o contrário, e o validador calculava
--      assim: acusava excesso onde a lei permite o dobro.
--
--   4. Recicla+ — 100% do valor é dedutível, mas dentro do teto geral. Não é
--      limite autônomo de 6%, como o catálogo deixava entender.
--
-- O que NÃO foi confirmado em fonte primária, e por isso fica marcado: o
-- percentual do esporte e a vigência do PRONON/PRONAS para pessoa física
-- depois do ano-calendário de 2025 (a Lei 12.715/2012 autorizava até lá).
--
-- POR QUE O CÁLCULO NÃO MUDA AQUI
--
-- `irpf_global_7` entra na tabela como REGISTRO, sem nenhum mecanismo
-- apontando para ele — do mesmo jeito que o `desporto_7` entrou na 030. O
-- teto condicional (6% sem esporte, 7% com) é lógica de `saldoDisponivel()`,
-- não dado, e não se escreve lógica fiscal nova sobre nota não assinada.
-- Manter 6% erra para menos: o servidor destina abaixo do que podia e
-- recupera no ano seguinte. O inverso o joga na malha fina.

-- ─────────────────────────────────────────────────────────────
-- 1. O teto conjunto de 7%, como registro
-- ─────────────────────────────────────────────────────────────
INSERT INTO tetos_deducao
  (codigo, descricao, percentual, base_legal, vigencia_inicio, confirmado_por_parecer, observacao)
VALUES
  ('irpf_global_7',
   'Teto global do IRPF quando há incentivo ao esporte',
   7.00,
   'LC 222/2025, art. 9º, § 1º, II, c/c Lei 9.250/1995, art. 12, I a III',
   '2026-01-01',
   FALSE,
   'NÃO USAR sem parecer, e nenhum mecanismo aponta para este teto. A LC 222/2025 '
   || 'fixa 7% para pessoa física EM CONJUNTO com os incisos I a III do art. 12 da '
   || 'Lei 9.250/1995 — a cesta inteira sobe de 6% para 7% quando o esporte entra, '
   || 'em vez de abrir limite separado. Percentual vindo de fonte secundária; o '
   || 'texto legal não foi lido. Aplicar exige lógica condicional em saldoDisponivel(), '
   || 'que hoje não existe: o sistema segue no irpf_global_6, que erra para menos.')
ON CONFLICT (codigo) DO NOTHING;

-- O `desporto_7` da 030 dizia "teto próprio, NÃO compõe os 6%". A 031 já o
-- desmentiu. Agora sabemos o que ele deveria ter dito desde sempre.
UPDATE tetos_deducao
   SET descricao  = 'Incentivo ao desporto — linha histórica, substituída por irpf_global_7',
       observacao = 'NÃO USAR. Linha mantida só para não quebrar referência antiga. '
                 || 'O percentual de 7% nunca foi um teto separado do desporto: com a '
                 || 'LC 222/2025 ele é o teto CONJUNTO, registrado em irpf_global_7.'
 WHERE codigo = 'desporto_7';

-- ─────────────────────────────────────────────────────────────
-- 2. O catálogo de leis passa a dizer o certo
-- ─────────────────────────────────────────────────────────────
UPDATE laws SET
  base_legal = 'Lei Complementar nº 222/2025; Decreto nº 12.861/2026; Portaria MESP nº 10/2026',
  observacao = 'A LC 222/2025 substituiu a Lei 11.438/2006 e tornou o incentivo permanente. '
            || 'Para pessoa física, 7% do imposto devido EM CONJUNTO com os incisos I a III '
            || 'do art. 12 da Lei 9.250/1995: não é teto próprio, é a cesta inteira subindo '
            || 'de 6% para 7%. Percentual de fonte secundária, não confirmado. '
            || 'Manifestações: Formação Esportiva, Esporte para Toda a Vida, Excelência '
            || 'Esportiva. Vedado pagamento de atleta profissional.'
 WHERE slug = 'lie';

UPDATE laws SET observacao =
  'Limite de 1% do imposto devido PRÓPRIO deste programa: não é dividido com o '
  || 'PRONAS/PCD e não entra no teto geral do art. 22 da Lei 9.532/1997. Quem usa os '
  || 'dois programas tem 1% em cada. VIGÊNCIA NÃO CONFIRMADA: a Lei 12.715/2012 '
  || 'autorizava a dedução da pessoa física até o ano-calendário de 2025. '
  || 'Credenciamento concomitante à submissão. Até 3 projetos/ano por entidade.'
 WHERE slug = 'pronon';

UPDATE laws SET observacao =
  'Limite de 1% do imposto devido PRÓPRIO deste programa: não é dividido com o '
  || 'PRONON e não entra no teto geral do art. 22 da Lei 9.532/1997. Quem usa os '
  || 'dois programas tem 1% em cada. VIGÊNCIA NÃO CONFIRMADA: a Lei 12.715/2012 '
  || 'autorizava a dedução da pessoa física até o ano-calendário de 2025. '
  || 'Mesma sistemática do PRONON. Reformas permitidas, ampliação vedada.'
 WHERE slug = 'pronas';

UPDATE laws SET observacao =
  'Pessoa física deduz 100% do valor destinado, mas DENTRO do teto geral: o limite '
  || 'de 6% do art. 4º, I, é apurado em conjunto com as deduções do art. 22 da Lei '
  || '9.532/1997, não é limite autônomo. Regulamentada pelo Decreto 12.106/2024 e pela '
  || 'Portaria GM/MMA 1.250/2024. PJ lucro real até 1% por trimestre ou ano. '
  || 'Foco em cooperativas de catadores, infraestrutura e logística reversa.'
 WHERE slug = 'lir';

-- ─────────────────────────────────────────────────────────────
-- 3. Por que cada um continua fora do alcance do cliente
--
-- Todos seguem indisponíveis. O que muda é o motivo escrito: vários diziam
-- "não confirmado" sobre coisas que a nota resolveu, e o motivo verdadeiro
-- é outro.
-- ─────────────────────────────────────────────────────────────
UPDATE incentive_groups SET motivo_indisponivel =
  'Teto identificado: 7% conjunto (LC 222/2025), registrado em irpf_global_7 — mas '
  || 'vindo de fonte secundária e sem parecer. Falta também a lógica condicional em '
  || 'saldoDisponivel(), que hoje só sabe um teto fixo. Item 1 da consulta.'
 WHERE code = 'lie';

UPDATE incentive_groups SET motivo_indisponivel =
  'Teto resolvido: 1% próprio deste programa, fora do teto geral — não dividido com o '
  || 'outro programa da Lei 12.715/2012. Falta confirmar a VIGÊNCIA para pessoa física '
  || 'depois do ano-calendário de 2025, e falta a jornada: a destinação é a entidade '
  || 'habilitada com CNES, não a projeto com PRONAC. Item 3 da consulta.'
 WHERE code IN ('pronon', 'pronas');

UPDATE incentive_groups SET motivo_indisponivel =
  'Teto resolvido: 100% do valor dedutível, dentro do teto geral de 6% do art. 22 da '
  || 'Lei 9.532/1997 — não é limite autônomo. Falta a jornada: projeto aprovado no '
  || 'SINIR+, não no SALIC. Item 4 da consulta.'
 WHERE code = 'lir';

-- Recicla+ e os dois programas de saúde agora têm teto conhecido. Mesmo assim
-- não recebem `teto_codigo`: um mecanismo indisponível que aponta para teto
-- entraria no cálculo de `tetosVigentes()` como se fosse operável. Enquanto
-- `disponivel_para_cliente` for FALSE, teto_codigo continua NULL de propósito.
