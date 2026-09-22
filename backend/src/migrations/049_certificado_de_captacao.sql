-- 049 — Certificado de Autorização para Captação
--
-- POR QUE
--
-- No FDCA/DF, uma OSC não capta porque quer: ela pede autorização ao CDCA/DF
-- (RN 125/2026, art. 12), o pedido vai ao Conselho de Administração do Fundo e
-- ao Plenário (art. 13) e, concedida, sai resolução no Diário Oficial e é
-- emitido o **Certificado de Autorização para Captação**. Sem certificado
-- válido, a captação não tem amparo — e hoje isso vive em planilha.
--
-- Não é o equivalente do PRONAC. O PRONAC identifica o projeto e vale
-- enquanto o projeto vale; o Certificado é uma AUTORIZAÇÃO COM VALIDADE, e a
-- validade tem consequência dura.
--
-- O QUE O CERTIFICADO CONTÉM (art. 14)
--
--   I.   nome, CNPJ, endereço e contato da OSC   → já em org_projects/organizations
--   II.  nome e finalidade do projeto            → já em org_projects.titulo/descricao
--   III. número e data da publicação da resolução de autorização  → NOVO
--   IV.  validade do registro da OSC no CDCA/DF                   → NOVO
--   V.   validade da autorização para a captação                  → NOVO
--
-- São duas validades diferentes, e é de propósito: o registro da OSC no
-- Conselho pode vencer antes da autorização, e nesse caso a captação para
-- porque a entidade deixou de estar registrada. Guardar só uma das duas
-- esconderia metade dos casos.
--
-- O PRAZO, E O QUE ACONTECE SE ELE PASSAR (art. 15)
--
-- A proposta autorizada tem DOIS ANOS para captar, contados da emissão do
-- certificado, prorrogáveis por igual período. A prorrogação se requer "com
-- antecedência de até 6 (seis) meses do fim do prazo" (§ 1º).
--
-- E o § 2º, IV é o motivo de tudo isto existir: desistir formalmente OU
-- **deixar extinguir o prazo sem pedido de prorrogação** faz os recursos já
-- captados irem para a universalidade da política distrital. Ou seja: a OSC
-- perde para o fundo geral o dinheiro que ela levantou. Não é multa nem
-- advertência — é o dinheiro mudando de dono por decurso de prazo.
--
-- UMA AMBIGUIDADE QUE NÃO VAMOS FINGIR QUE RESOLVEMOS
--
-- "com antecedência de até 6 meses do fim do prazo" comporta duas leituras:
-- que a janela para pedir ABRE seis meses antes do fim, ou que o pedido tem
-- de ser feito com no MÍNIMO seis meses de antecedência. A diferença decide
-- se uma OSC com três meses restantes ainda pode pedir.
--
-- Não é pergunta de tributarista, é do próprio CDCA/DF. Enquanto não houver
-- resposta, a tela avisa a partir dos seis meses e manda procurar o Conselho,
-- sem afirmar qual leitura vale. Avisar mais cedo serve às duas.
--
-- A META DE CAPTAÇÃO NÃO VEM DO CERTIFICADO
--
-- `meta_captacao` sai da planilha orçamentária do art. 12, III, não do
-- certificado — o art. 14 não lista valor. Entra junto porque o art. 15, § 2º
-- inteiro trata do que fazer quando a captação não alcança o necessário, e
-- sem a meta não há como dizer que não alcançou.

ALTER TABLE org_projects
  ADD COLUMN IF NOT EXISTS certificado_numero       TEXT,
  ADD COLUMN IF NOT EXISTS certificado_publicado_em DATE,
  ADD COLUMN IF NOT EXISTS certificado_valido_ate   DATE,
  ADD COLUMN IF NOT EXISTS registro_osc_valido_ate  DATE,
  ADD COLUMN IF NOT EXISTS meta_captacao            NUMERIC(14,2)
    CHECK (meta_captacao IS NULL OR meta_captacao > 0);

COMMENT ON COLUMN org_projects.certificado_numero IS
  'Número da resolução de autorização publicada no DODF (RN 125/2026, art. 14, III). '
  'É por ele que a OSC e o Conselho se referem à autorização.';

COMMENT ON COLUMN org_projects.certificado_publicado_em IS
  'Data da publicação da resolução no Diário Oficial (art. 14, III).';

COMMENT ON COLUMN org_projects.certificado_valido_ate IS
  'Até quando a autorização para captar vale (art. 14, V). Dois anos da emissão, '
  'prorrogáveis por igual período (art. 15). Passar deste dia sem ter pedido '
  'prorrogação manda os recursos já captados para a universalidade da política '
  '(art. 15, § 2º, IV) — o dinheiro muda de dono por decurso de prazo.';

COMMENT ON COLUMN org_projects.registro_osc_valido_ate IS
  'Até quando o registro da OSC no CDCA/DF vale (art. 14, IV). Validade separada '
  'da autorização: o registro pode vencer antes, e aí a captação para pela '
  'entidade, não pelo projeto.';

COMMENT ON COLUMN org_projects.meta_captacao IS
  'Valor que o projeto precisa captar, da planilha orçamentária (art. 12, III). '
  'Não consta do certificado; entra porque o art. 15, § 2º trata inteiro do que '
  'fazer quando a captação não alcança o necessário.';

-- A tela do Conselho pergunta "o que vence primeiro?", e vai perguntar com
-- frequência. Índice parcial: projeto sem certificado não interessa a essa
-- pergunta, e hoje são todos menos os do FDCA.
CREATE INDEX IF NOT EXISTS idx_org_projects_certificado
  ON org_projects(certificado_valido_ate)
  WHERE certificado_valido_ate IS NOT NULL;
