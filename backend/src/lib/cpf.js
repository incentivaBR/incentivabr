/**
 * CPF: limpar, validar e mascarar. Um lugar só.
 *
 * No backend a validação estava em `routes/auth.js` e a máscara em
 * `routes/admin.js`; agora a destinação também precisa das duas. Cópia de
 * regra de documento diverge em silêncio: basta uma delas aceitar o que a
 * outra recusa para o cadastro e a destinação discordarem sobre a mesma
 * pessoa.
 *
 * O navegador tem a própria cópia em `frontend/js/utils.js`, que não importa
 * este arquivo: as páginas não têm etapa de build. A daqui é a que decide —
 * a do navegador só evita uma ida ao servidor.
 */

/** Só os dígitos. */
export function limpaCPF(cpf) {
  return String(cpf ?? '').replace(/\D/g, '');
}

/**
 * Confere os dois dígitos verificadores.
 *
 * Não diz que o CPF existe na Receita — diz que o número é bem formado.
 * Sequências de um dígito só (111.111.111-11) passam na conta e são
 * recusadas à parte, porque na prática são digitação de teste.
 */
export function cpfValido(cpf) {
  const c = limpaCPF(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (soma % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (soma % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

/** `•••.•••.247-25` — o bastante para reconhecer a conta, não para ler o documento. */
export function mascaraCPF(cpf) {
  const c = limpaCPF(cpf);
  return c.length === 11 ? `•••.•••.${c.slice(6, 9)}-${c.slice(9)}` : '—';
}

/** `529.982.247-25`, para o recibo e para a tela de quem é dono do número. */
export function formataCPF(cpf) {
  const c = limpaCPF(cpf);
  return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : '';
}

export default { limpaCPF, cpfValido, mascaraCPF, formataCPF };
