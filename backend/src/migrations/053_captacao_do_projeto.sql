-- 053 — Quanto o projeto pode captar, quanto já captou, e até quando
--
-- POR QUE
--
-- O site mostra o projeto e não mostra a única coisa que dá urgência a ele: o
-- prazo. Um projeto aprovado com R$ 635 mil autorizados e três meses de janela
-- é uma situação; o mesmo projeto sem data é um cartaz.
--
-- E para o proponente, ver a captação dele na tela é o que transforma "uma
-- plataforma" em "a nossa operação". É o dado que ele já persegue em planilha.
--
-- POR QUE `valores_em` EXISTE, E É A COLUNA QUE MAIS IMPORTA
--
-- Captado é um número que envelhece. Um "R$ 0 captado" conferido em setembro,
-- exibido em dezembro, é mentira na tela — e mentira sobre dinheiro, na página
-- que pede transferência.
--
-- Em modo simulação a plataforma não consulta o SALIC: estes valores são um
-- retrato, digitado por alguém a partir da consulta oficial. `valores_em` diz
-- de quando é o retrato, a tela diz isso junto do número, e `lib/captacao.js`
-- marca como defasado o que passou do prazo de validade.
--
-- Quando a simulação for desligada, a consulta ao SALIC passa a responder na
-- hora e estes campos viram a reserva — o que o site mostra enquanto a API do
-- Ministério não responde, em vez de não mostrar nada.
--
-- POR QUE O PRAZO NÃO É `certificado_valido_ate`
--
-- Aquela coluna é do FDCA: Certificado de Autorização para Captação, com a
-- consequência do art. 15, § 2º, IV da RN 125/2026. Isto aqui é a janela de
-- captação da Rouanet, que é outra coisa, de outra lei, com outro efeito ao
-- vencer. Reaproveitar a coluna faria as duas regras se misturarem no dia em
-- que um cliente tivesse as duas.

ALTER TABLE org_projects
  ADD COLUMN IF NOT EXISTS valor_autorizado  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS valor_captado     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS captacao_inicio   DATE,
  ADD COLUMN IF NOT EXISTS captacao_fim      DATE,
  ADD COLUMN IF NOT EXISTS valores_em        DATE;

COMMENT ON COLUMN org_projects.valor_autorizado IS
  'O que o órgão autorizou captar. Na Rouanet é o "Autorizado" da consulta do '
  'SALIC — não o solicitado, nem o total da proposta.';

COMMENT ON COLUMN org_projects.valor_captado IS
  'Quanto já entrou na conta de captação, segundo a fonte oficial. NULL = não '
  'sabemos, e não sabemos é diferente de zero: a tela não pode escrever "R$ 0 '
  'captado" quando o que houve foi falta de consulta.';

COMMENT ON COLUMN org_projects.captacao_fim IS
  'Último dia para o dinheiro entrar. É daqui que sai a urgência real, e ela '
  'não é a validade do Certificado do FDCA (certificado_valido_ate): outra '
  'lei, outro efeito ao vencer.';

COMMENT ON COLUMN org_projects.valores_em IS
  'Data em que valor_autorizado e valor_captado foram conferidos na fonte. '
  'Sem isto, um retrato velho vira afirmação atual sobre dinheiro — na mesma '
  'página que pede transferência. lib/captacao.js marca o que envelheceu.';
