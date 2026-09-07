/**
 * Tenant Manager - Gerencia configurações multi-tenant
 * IncentivaBR
 */

/**
 * Cor de acento da marca IncentivaBR.
 *
 * As paginas do fluxo trazem esta cor codificada, junto com dois tons
 * derivados escolhidos a mao (#D4874E para hover, #E07A35 para gradiente) que
 * NAO sao calculos sobre ela. Enquanto a organizacao usar o acento padrao, os
 * tons ficam como estao — calcular repintaria o site de quem nao pediu nada.
 * Assim que uma organizacao traz cor propria, ai sim os tons sao derivados
 * dela, porque manter o laranja da IncentivaBR num tema alheio e pior.
 */
const ACENTO_PADRAO = '#EE985C';

/**
 * Suspende as transicoes CSS enquanto o tema e trocado.
 *
 * Sem isso, elementos com `transition: all` (varios botoes do fluxo usam)
 * ficam com a cor ANTIGA depois que a variavel muda: a transicao fixa o valor
 * ja computado e nao reavalia o var(). Da para comprovar clonando o botao —
 * o clone, sem historico de transicao, nasce com a cor nova; o original nao.
 *
 * A supressao dura dois quadros: tempo de o navegador recalcular o estilo sem
 * animar. E a mesma tecnica usada para evitar o "flash" ao trocar de tema.
 */
function semTransicoes(fn) {
  const trava = document.createElement('style');
  trava.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(trava);
  fn();
  // leitura forcada: garante que o estilo foi recalculado com a trava ativa
  void document.body?.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => trava.remove()));
}

/**
 * Escreve o acento e, se ele nao for o padrao, os tons que dependem dele.
 */
function aplicaAcento(cor) {
  if (!cor) return;
  semTransicoes(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty('--secondary-color', cor);
    raiz.style.setProperty('--accent-color', cor);

    // Os três canais separados ("238 152 92"), para o Tailwind aplicar
    // transparência ao acento (js/tema.js: `bg-gold/20`, `text-gold/80`).
    const hex = String(cor).trim().replace('#', '');
    const h6 = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    if (/^[0-9a-f]{6}$/i.test(h6)) {
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h6.slice(i, i + 2), 16));
      raiz.style.setProperty('--secondary-rgb', `${r} ${g} ${b}`);
    }

    if (String(cor).trim().toUpperCase() === ACENTO_PADRAO) return;

    raiz.style.setProperty('--secondary-hover', `color-mix(in srgb, ${cor} 88%, #000)`);
    raiz.style.setProperty('--secondary-dark',  `color-mix(in srgb, ${cor} 78%, #000)`);
  });
}

/**
 * Qual organização esta aba está mostrando.
 *
 * Fora de produção a white label é alcançada por `?org=casa-azul` — o
 * subdomínio exige DNS, e numa demonstração ninguém vai esperar propagação.
 * Só que um parâmetro de URL morre no primeiro link clicado: a pessoa abre a
 * página com a marca do cliente, clica em "Simular", e cai numa tela
 * IncentivaBR. Guardar na sessão faz a escolha durar a visita inteira.
 */
function orgDaSessao() {
  const daUrl = new URLSearchParams(window.location.search).get('org');
  if (daUrl) {
    try { sessionStorage.setItem('incentivabr_org', daUrl); } catch { /* modo privado */ }
    return daUrl;
  }
  try { return sessionStorage.getItem('incentivabr_org') || ''; } catch { return ''; }
}

/**
 * A logo_url aponta para uma das logos da própria IncentivaBR? Aí não é
 * marca de cliente e a página fica com a variante que já escolheu.
 */
function ehLogoDaPlataforma(url) {
  return /\/assets\/logo-incentivabr(-compact|-icon)?\.png$/i.test(String(url).split(/[?#]/)[0]);
}

/** Acrescenta `?org=` a um endereço, preservando o que já houver de query. */
function comOrg(endereco) {
  const org = orgDaSessao();
  if (!org) return endereco;
  return endereco + (endereco.includes('?') ? '&' : '?') + 'org=' + encodeURIComponent(org);
}

/** Um endereço interno do próprio site, que ainda não leva a organização. */
function precisaDeOrg(href) {
  if (!href) return false;
  if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) return false;
  if (/[?&]org=/.test(href)) return false;
  if (/^https?:\/\//i.test(href)) {
    try { return new URL(href).origin === window.location.origin; } catch { return false; }
  }
  return true;
}

/**
 * Toda chamada de API leva a organização, sem a página precisar saber disso.
 *
 * Este é o ponto em que a multi-tenância deixa de ser responsabilidade de cada
 * tela. Antes, cada página lembrava (ou esquecia) de anexar `?org=` na mão —
 * e `projetos-rouanet.html` esquecia, com a própria cópia de `carregarProjeto()`
 * buscando `/api/salic/org-project` sem organização. O resultado era o botão
 * "Destinar" da Casa Azul apontando para o projeto da Orquestra das Periferias.
 *
 * Consertar aquela cópia resolveria uma tela. Envolver o `fetch` resolve todas
 * as telas que existem e todas as que vierem — que é o que um núcleo
 * multi-cliente precisa fazer.
 */
function apiSempreComOrg() {
  if (window.__fetchComOrg) return;
  const original = window.fetch;
  window.fetch = function (recurso, opcoes) {
    try {
      const url = typeof recurso === 'string' ? recurso : recurso?.url;
      // Só rotas de API deste mesmo servidor. Recursos externos ficam intactos.
      if (typeof url === 'string' && /(^|\/)api\//.test(url) && precisaDeOrg(url)) {
        return original.call(this, comOrg(url), opcoes);
      }
    } catch { /* qualquer dúvida, segue o original */ }
    return original.call(this, recurso, opcoes);
  };
  window.__fetchComOrg = true;
}

/**
 * Todo clique interno leva a organização — inclusive em links criados depois.
 *
 * Reescrever os links no carregamento não bastava: os botões que mais importam
 * nascem de `innerHTML` já com a página montada, então o reescritor passava
 * antes deles existirem. Decidir no clique não tem esse problema, porque aí o
 * link já existe, seja qual for o código que o criou.
 */
function navegacaoSempreComOrg() {
  document.addEventListener('click', evento => {
    if (!orgDaSessao()) return;
    const link = evento.target?.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (precisaDeOrg(href)) link.setAttribute('href', comOrg(href));
  }, true);   // fase de captura: antes de qualquer handler da página
}

// Instalado no instante em que este arquivo roda, não no DOMContentLoaded:
// páginas que disparam fetch durante a montagem precisam já encontrar o
// envelope no lugar.
apiSempreComOrg();

const tenant = {
  // Cache da organização
  _organization: null,

  /**
   * Carrega configuração da organização do servidor
   */
  async loadOrganizationConfig() {
    try {
      // Pega org da URL (para desenvolvimento)
      const baseUrl = typeof api !== 'undefined' && api.baseUrl ? api.baseUrl : '';
      const url = comOrg(`${baseUrl}/api/config/organization`);

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'success' && data.organization) {
        this.applyOrganizationTheme(data.organization);
        this._organization = data.organization;
        return data.organization;
      }
    } catch (error) {
      console.error('Erro ao carregar organizacao:', error);
      // Tentar carregar do localStorage como fallback
      const cached = this.getOrganization();
      if (cached) {
        this.applyOrganizationTheme(cached);
        return cached;
      }
    }
    return null;
  },

  /**
   * Aplica tema da organização na página
   */
  applyOrganizationTheme(org) {
    if (!org) return;

    // Salvar no localStorage para uso em outras páginas
    localStorage.setItem('incentivabr_org', JSON.stringify(org));
    this._organization = org;

    // Aplicar cores CSS
    if (org.primary_color) {
      document.documentElement.style.setProperty('--primary-color', org.primary_color);
    }
    aplicaAcento(org.secondary_color);

    // Atualizar nome da organização onde existir
    const orgNameElements = document.querySelectorAll('.org-name');
    orgNameElements.forEach(el => el.textContent = org.name);

    // Atualizar nome do fundo
    const fundNameElements = document.querySelectorAll('.fund-name');
    fundNameElements.forEach(el => el.textContent = org.fund_name || 'Fundo de Incentivo');

    // Atualizar limite máximo
    const maxPercentElements = document.querySelectorAll('.max-percentage');
    maxPercentElements.forEach(el => el.textContent = (org.max_percentage || 6) + '%');

    // Atualizar base legal
    const legalBasisElements = document.querySelectorAll('.legal-basis');
    legalBasisElements.forEach(el => el.textContent = org.legal_basis || '');

    // Atualizar logo se houver
    if (org.logo_url) {
      const logoElements = document.querySelectorAll('.org-logo');
      logoElements.forEach(el => {
        if (el.tagName === 'IMG') {
          el.src = org.logo_url;
        }
      });
    }

    // Atualizar título da página
    if (org.slug !== 'www') {
      const currentTitle = document.title;
      if (!currentTitle.includes(org.name)) {
        document.title = `${org.name} | IncentivaBR`;
      }
    }

    // Disparar evento customizado
    window.dispatchEvent(new CustomEvent('tenantLoaded', { detail: org }));
  },

  /**
   * Obter organização do cache/localStorage
   */
  getOrganization() {
    if (this._organization) {
      return this._organization;
    }
    const org = localStorage.getItem('incentivabr_org');
    if (org) {
      this._organization = JSON.parse(org);
      return this._organization;
    }
    return null;
  },

  /**
   * Obter limite máximo de dedução (%)
   */
  getMaxPercentage() {
    const org = this.getOrganization();
    return org ? parseFloat(org.max_percentage) || 6 : 6;
  },

  /**
   * Obter dados bancários da organização
   */
  getBankData() {
    const org = this.getOrganization();
    if (!org) return null;

    return {
      bank_name: org.bank_name,
      bank_code: org.bank_code,
      bank_agency: org.bank_agency,
      bank_account: org.bank_account,
      pix_key: org.pix_key,
      pix_key_type: org.pix_key_type,
      beneficiary_name: org.beneficiary_name,
      beneficiary_cnpj: org.beneficiary_cnpj
    };
  },

  /**
   * Verifica se é a organização padrão (www)
   */
  isDefaultOrg() {
    const org = this.getOrganization();
    return !org || org.slug === 'www';
  },

  /**
   * Obter slug da organização atual
   */
  getSlug() {
    const org = this.getOrganization();
    return org ? org.slug : 'www';
  },

  /**
   * Carrega configuração de marca via /api/config/brand
   * Mais leve que loadOrganizationConfig — ideal para inicialização rápida.
   */
  async loadBrand() {
    try {
      const baseUrl = typeof api !== 'undefined' && api.baseUrl ? api.baseUrl : '';
      // Sem o `org` aqui, a página saía com as CORES do cliente e o NOME e a
      // LOGO da IncentivaBR — identidade misturada na mesma tela.
      const response = await fetch(comOrg(`${baseUrl}/api/config/brand`));
      if (!response.ok) return;
      const brand = await response.json();
      this._applyBrand(brand);
      return brand;
    } catch (error) {
      console.error('Erro ao carregar brand:', error);
    }
    return null;
  },

  _applyBrand(brand) {
    if (!brand) return;
    window.__brand = brand;

    if (brand.color_primary) {
      document.documentElement.style.setProperty('--primary-color', brand.color_primary);
    }
    aplicaAcento(brand.color_accent);

    // Atualizar elementos com classe .brand-name
    document.querySelectorAll('.brand-name').forEach(el => {
      el.textContent = brand.name;
    });

    // Atualizar logotipos com classe .brand-logo — só quando a logo é de um
    // cliente white-label. A da própria IncentivaBR cada página já traz na
    // variante certa para o lugar (horizontal na barra, vertical nas telas
    // de convite e de senha). Trocar pela logo_url do banco punha a versão
    // quadrada na barra de 36px de altura: a logo abria grande e "encolhia"
    // um instante depois, assim que esta resposta chegava.
    if (brand.logo_url && !ehLogoDaPlataforma(brand.logo_url)) {
      document.querySelectorAll('.brand-logo').forEach(el => {
        if (el.tagName === 'IMG') el.src = brand.logo_url;
      });
    }

    // Expor simulation_mode globalmente
    window.SIMULATION_MODE = brand.simulation_mode === true;

    // O teto de dedução, vindo do banco.
    //
    // Sem isto, cada tela guardava a própria cópia do 6% — havia oito no
    // frontend. Mover o número para o banco não adiantaria: o banco diria uma
    // coisa e a calculadora mostraria outra. O fallback de 6 mantém a tela de
    // pé se a requisição falhar, e é o valor conservador.
    //
    // Incide sobre o IMPOSTO DEVIDO apurado na declaração — não sobre a renda,
    // nem sobre o imposto a pagar depois de retenções.
    window.TETO_PERCENTUAL = Number(brand.teto_percentual) || 6;
    window.TETO_FRACAO     = window.TETO_PERCENTUAL / 100;
    window.TETO_BASE_LEGAL = brand.teto_base_legal || 'Lei 9.532/1997, art. 22';

    // A fonte única dos textos fiscais (backend/src/lib/textosFiscais.js).
    //
    // Cada página escreve o valor de hoje como texto de reserva dentro de um
    // <span data-fiscal="teto_pct">6%</span>; aqui ele é trocado pelo que o
    // servidor mandou. Sem JavaScript ou com a API fora, a página continua
    // legível — só não acompanha o banco. A TINA recebe o mesmo objeto, em
    // texto, no prompt.
    if (brand.fiscal) {
      window.FISCAL = brand.fiscal;
      const f = brand.fiscal;
      const pct = n => String(Math.round(Number(n) * 100) / 100).replace('.', ',') + '%';
      const valores = {
        teto_pct:          pct(f.teto.percentual),
        teto_base:         f.teto.base_legal || '',
        prazo_recibo:      String(f.recibo.prazo_dias),
        dirpf_ficha:       f.dirpf.ficha,
        dirpf_cultura:     String(f.dirpf.codigos.cultura),
        dirpf_eca:         String(f.dirpf.codigos.eca),
        dirpf_idoso:       String(f.dirpf.codigos.idoso),
        dirpf_desporto:    String(f.dirpf.codigos.desporto),
        dirpf_audiovisual: String(f.dirpf.codigos.audiovisual),
        art18_pct:         pct(f.rouanet.art18_dedutivel_pct),
        art26_pct:         pct(f.rouanet.art26_dedutivel_pct),
        guarda_anos:       String(f.guarda_documentos_anos)
      };
      document.querySelectorAll('[data-fiscal]').forEach(el => {
        const v = valores[el.dataset.fiscal];
        if (v != null && v !== '') el.textContent = v;
      });
    }

    window.dispatchEvent(new CustomEvent('brandLoaded', { detail: brand }));
  }
};

/**
 * Preenche a página com o projeto da organização.
 *
 * O PRONAC estava escrito à mão em nove arquivos do frontend, sempre o mesmo
 * projeto fictício. Isso fazia entrar um cliente novo ser deploy: para a Casa
 * Azul aparecer, alguém editaria arquivo e publicaria. Agora cada página só
 * MARCA o que precisa ser preenchido, e o dado vem do cadastro.
 *
 * Três marcações, todas opcionais:
 *
 *   <a data-destinar>                → vira link para destinar, com pronac e título
 *   <span data-projeto="pronac">     → recebe o PRONAC
 *   <span data-projeto="titulo">     → recebe o nome do projeto
 *
 * Sem projeto cadastrado, os links de destinar são desativados em vez de
 * apontarem para lugar nenhum — melhor um botão explicando que falta cadastro
 * do que um que leva a uma tela quebrada.
 */
async function preencheProjeto() {
  const marcados = document.querySelectorAll('[data-destinar], [data-projeto]');
  if (!marcados.length) return;   // página não usa projeto

  let projeto = null;
  try {
    const baseUrl = typeof api !== 'undefined' && api.baseUrl ? api.baseUrl : '';
    // Sem o `org`, isto resolve para a IncentivaBR e os botões "Destinar"
    // levam ao projeto de outra instituição — na página do cliente.
    const resp = await fetch(comOrg(`${baseUrl}/api/salic/org-project`));
    if (resp.ok) {
      const dados = await resp.json();
      projeto = dados.projeto || null;
    }
  } catch (erro) {
    console.error('[tenant] não foi possível carregar o projeto da organização:', erro);
  }

  if (!projeto?.pronac) {
    document.querySelectorAll('a[data-destinar]').forEach(a => {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
      a.style.opacity = '0.55';
      a.style.cursor = 'not-allowed';
      a.title = 'Nenhum projeto cadastrado para esta organização.';
    });
    return;
  }

  const titulo = projeto.nome || `Projeto PRONAC ${projeto.pronac}`;

  document.querySelectorAll('a[data-destinar]').forEach(a => {
    // O atributo pode trazer parâmetros extras que a página já usava,
    // como o valor vindo da calculadora: data-destinar="valor=1200"
    const extra = a.getAttribute('data-destinar');
    const params = new URLSearchParams({ pronac: projeto.pronac, titulo });
    if (extra) new URLSearchParams(extra).forEach((v, k) => params.set(k, v));
    // Estes links nascem depois do DOMContentLoaded, então o reescritor de
    // links já passou. Sem o `org` aqui, o destinador atravessa a fronteira
    // para a IncentivaBR bem no clique que mais importa.
    a.href = comOrg(`destinar-rouanet.html?${params}`);
  });

  document.querySelectorAll('[data-projeto]').forEach(el => {
    const campo = el.getAttribute('data-projeto');
    const valor = campo === 'titulo' ? titulo : projeto[campo];
    if (valor != null) el.textContent = valor;
  });

  window.__projeto = projeto;
  window.dispatchEvent(new CustomEvent('projetoCarregado', { detail: projeto }));
}

// Exposta porque algumas páginas só descobrem os parâmetros do link depois de
// carregar — a de projetos acrescenta o valor vindo da calculadora, e o painel
// monta os cartões por innerHTML depois da resposta da API.
tenant.preencheProjeto = preencheProjeto;

// `const` em script clássico cria uma global léxica: outras páginas enxergam
// `tenant`, mas nada fora do documento enxerga — nem código de teste, nem um
// iframe. Publicar no window é o que torna isto uma biblioteca de fato.
window.tenant = tenant;

// Carregar automaticamente ao iniciar a página
// loadBrand primeiro (rápido, usa .env) → loadOrganizationConfig depois (org sobrescreve se tiver cores próprias)
document.addEventListener('DOMContentLoaded', async () => {
  navegacaoSempreComOrg();
  await tenant.loadBrand();
  tenant.loadOrganizationConfig();
  preencheProjeto();
});
