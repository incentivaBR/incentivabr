// Páginas que existem só na IncentivaBR, nunca no site de um cliente.
//
// O mesmo processo serve os dois: a organização `www` é a plataforma e
// qualquer outra é um cliente white-label. O que muda entre uma e outra é
// quase sempre texto, e `tenant.js` resolve isso escondendo trechos marcados
// com `data-so-plataforma`. Uma página inteira não dá para resolver assim: o
// endereço continua existindo, e quem chegasse nele pelo domínio do cliente
// leria a IncentivaBR oferecendo ao público DELE a tecnologia que ele já
// contratou.
//
// Por isso a lista abaixo é conferida no servidor, antes de qualquer arquivo
// estático ser entregue: no domínio do cliente a página não chega a carregar.
// Esconder pelo navegador não serviria — o HTML já teria saído daqui.
export const PAGINAS_DA_PLATAFORMA = [
  // Carta de vendas do white-label: "por que sua associação deveria oferecer
  // isso", "como funciona a parceria", preço. É a IncentivaBR procurando
  // cliente novo.
  '/para-associacoes.html'
];

const listaNormalizada = new Set(PAGINAS_DA_PLATAFORMA);

/** O caminho pedido é de uma página que só a plataforma mostra? */
export function ehPaginaDaPlataforma(caminho) {
  if (!caminho) return false;
  // `/Para-Associacoes.HTML` chegaria ao mesmo arquivo em sistema de arquivos
  // que não diferencia maiúscula; a guarda tem de cobrir isso também.
  const limpo = String(caminho).split('?')[0].split('#')[0].toLowerCase();
  return listaNormalizada.has(limpo);
}

/**
 * Middleware. Precisa vir depois do tenantMiddleware (que descobre quem é o
 * tenant) e antes do express.static (que entregaria o arquivo).
 */
export function guardaDePaginasDaPlataforma(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!ehPaginaDaPlataforma(req.path)) return next();

  const slug = req.organization?.slug || 'www';
  if (slug === 'www') return next();

  // O `?org=` é como se testa um cliente em desenvolvimento. Sem levá-lo
  // adiante, o redirecionamento devolveria a pessoa à página da plataforma e
  // pareceria que o white-label não funciona.
  const destino = req.query.org
    ? '/index.html?org=' + encodeURIComponent(req.query.org)
    : '/index.html';
  return res.redirect(302, destino);
}
