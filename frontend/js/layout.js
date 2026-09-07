/* ═══════════════════════════════════════════════════════════
   layout.js — a barra e o rodapé únicos do IncentivaBR

   Uso, no fim do <body>, depois de auth.js:
     <script src="js/auth.js"></script>
     <script src="js/layout.js"></script>
     <script>Layout.init('calculadora');</script>

   Opções: Layout.init(idAtivo, { skipNav, skipFooter })

   Por que existe: o Raio-X de set/2026 (risco 11) contou 21 barras de
   navegação copiadas de página em página, cada uma com links diferentes, e
   este arquivo injetando uma segunda barra cujo CSS nunca era carregado —
   nove páginas mostravam duas. Agora a barra é uma só, o CSS vem junto
   (injetado abaixo, como o da TINA), e as páginas não trazem <nav> nem
   <footer> próprios.

   O aviso legal (INPI, registro) NÃO vem daqui: fica no HTML de cada página,
   propagado por scripts/sync-aviso-legal.mjs, para existir sem JavaScript.

   Cores: o azul da barra é o navy que as páginas já usam (#0F1E3D); o acento
   vem de --secondary-color, que tenant.js troca pela cor do cliente. A logo
   leva a classe brand-logo, que tenant.js troca pela logo do cliente.
   ═══════════════════════════════════════════════════════════ */

const Layout = {

  /* Links de navegação — ordem e IDs fixos. O id é o que a página passa
     em Layout.init() para marcar onde está. */
  _links: [
    { id: 'calculadora', href: 'calculadora.html',      label: 'Calculadora' },
    { id: 'projetos',    href: 'projetos-rouanet.html', label: 'Projetos' },
    { id: 'como',        href: 'como-funciona.html',    label: 'Como funciona' },
    { id: 'contador',    href: 'espaco-contador.html',  label: 'Contadores' },
    { id: 'faq',         href: 'faq.html',              label: 'FAQ' }
  ],

  /* ─── Ponto de entrada ──────────────────────────────────── */
  init(activePage = '', opts = {}) {
    try {
      this._injectStyles();
      if (!opts.skipNav) this._injectNav(activePage);
      if (!opts.skipFooter) this._injectFooter();
      this._updateAuth();
      this._setupFadeUp();
    } catch (err) {
      console.error('[Layout] Erro ao inicializar:', err);
    } finally {
      /* Garante que o body SEMPRE se torna visível, mesmo com erro */
      document.body.classList.add('dai-ready');
    }
  },

  /* ─── CSS ────────────────────────────────────────────────── */
  _injectStyles() {
    if (document.getElementById('dai-layout-styles')) return;
    const s = document.createElement('style');
    s.id = 'dai-layout-styles';
    s.textContent = `
      :root { --dai-navy: #0F1E3D; --dai-acento: var(--secondary-color, #EE985C); }

      /* Sem backdrop-filter de propósito: filtro no <nav> faria a gaveta do
         celular (position: fixed, filha dele) se posicionar em relação à
         barra, e ela apareceria cortada com 56px de altura. */
      .dai-nav { position: sticky; top: 0; z-index: 60; background: var(--dai-navy);
                 border-bottom: 1px solid rgba(238,152,92,0.14); font-family: 'Montserrat', system-ui, sans-serif; }
      .dai-nav__inner { max-width: 1152px; margin: 0 auto; padding: 0 16px; height: 64px;
                        display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .dai-nav__logo { display: inline-flex; align-items: center; background: #fff; border-radius: 12px;
                       padding: 5px 12px; text-decoration: none; flex-shrink: 0; }
      .dai-nav__logo img { height: 36px; width: auto; display: block; }
      .dai-nav__links { display: flex; align-items: center; gap: 18px; }
      .dai-nav__link { color: rgba(255,255,255,0.65); font-size: 14px; text-decoration: none; transition: color .2s; }
      .dai-nav__link:hover, .dai-nav__link--active { color: #fff; }
      .dai-nav__link--active { font-weight: 700; }
      .dai-nav__enter { color: rgba(255,255,255,0.75); font-size: 12px; text-decoration: none;
                        border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 6px 16px; transition: .2s; }
      .dai-nav__enter:hover { color: #fff; border-color: rgba(255,255,255,0.45); }
      .dai-nav__cta { background: var(--dai-acento); color: #fff; font-weight: 700; font-size: 12px;
                      text-decoration: none; border-radius: 999px; padding: 7px 16px; transition: filter .2s; }
      .dai-nav__cta:hover { filter: brightness(1.06); }
      .dai-nav__cta[aria-disabled="true"] { opacity: .55; cursor: not-allowed; }

      .dai-nav__burger { display: none; background: none; border: 0; padding: 8px; cursor: pointer; }
      .dai-nav__burger span { display: block; width: 22px; height: 2px; background: #fff; margin: 4px 0;
                              border-radius: 2px; transition: transform .25s, opacity .25s; }
      .dai-nav__overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 59; }

      @media (max-width: 860px) {
        .dai-nav__burger { display: block; }
        .dai-nav__links { position: fixed; top: 64px; right: 0; bottom: 0; width: min(320px, 85vw);
                          flex-direction: column; align-items: stretch; gap: 0; padding: 12px 0 24px;
                          background: var(--dai-navy); border-left: 1px solid rgba(255,255,255,0.08);
                          transform: translateX(100%); transition: transform .25s ease; overflow-y: auto; }
        .dai-nav--open .dai-nav__links { transform: none; }
        .dai-nav--open .dai-nav__overlay { display: block; }
        /* Com a gaveta aberta, a barra fica acima de tudo — inclusive do
           balão da TINA, que usa z-index alto. */
        .dai-nav--open { z-index: 100000; }
        .dai-nav__link { padding: 14px 24px; font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .dai-nav__enter, .dai-nav__cta { margin: 12px 24px 0; text-align: center; font-size: 14px; padding: 12px 16px; }
        .dai-nav--open .dai-nav__burger span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
        .dai-nav--open .dai-nav__burger span:nth-child(2) { opacity: 0; }
        .dai-nav--open .dai-nav__burger span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
        body.dai-nav-locked { overflow: hidden; }
      }

      .dai-footer { background: var(--dai-navy); color: rgba(255,255,255,0.55); font-family: 'Montserrat', system-ui, sans-serif;
                    border-top: 1px solid rgba(255,255,255,0.08); }
      .dai-footer__inner { max-width: 1152px; margin: 0 auto; padding: 36px 16px 28px; text-align: center; }
      .dai-footer__logo { display: inline-flex; align-items: center; background: #fff; border-radius: 10px; padding: 5px 14px; }
      .dai-footer__logo img { height: 30px; width: auto; display: block; }
      .dai-footer__links { margin: 18px 0 10px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; font-size: 13px; }
      .dai-footer__link { color: rgba(255,255,255,0.65); text-decoration: none; }
      .dai-footer__link:hover { color: #fff; text-decoration: underline; }
      .dai-footer__legal { font-size: 12px; line-height: 1.6; margin: 0; }

      .fade-up { opacity: 0; transform: translateY(14px); transition: opacity .6s ease, transform .6s ease; }
      .fade-up.visible { opacity: 1; transform: none; }
    `;
    document.head.appendChild(s);
  },

  /* ─── Nav ────────────────────────────────────────────────── */
  _injectNav(activePage) {
    const linksHtml = this._links.map(l => {
      const active = l.id === activePage ? ' dai-nav__link--active' : '';
      return `<a href="${l.href}" class="dai-nav__link${active}">${l.label}</a>`;
    }).join('');

    const nav = document.createElement('nav');
    nav.id = 'daiNav';
    nav.className = 'dai-nav';
    nav.setAttribute('aria-label', 'Principal');
    nav.innerHTML = `
      <div class="dai-nav__inner">
        <a href="index.html" class="dai-nav__logo" aria-label="Início">
          <img class="brand-logo" src="assets/logo-incentivabr-compact.png" alt="IncentivaBR">
        </a>
        <button type="button" class="dai-nav__burger" id="daiNavBurger" aria-label="Abrir menu"
                aria-controls="daiNavLinks" aria-expanded="false"><span></span><span></span><span></span></button>
        <div class="dai-nav__links" id="daiNavLinks">
          ${linksHtml}
          <a href="login.html" id="daiNavAuth" class="dai-nav__enter">Entrar</a>
          <a href="destinar-rouanet.html" data-destinar class="dai-nav__cta">Destinar agora</a>
        </div>
      </div>
      <div class="dai-nav__overlay" id="daiNavOverlay"></div>`;

    document.body.insertBefore(nav, document.body.firstChild);
    this._setupMenu(nav);
  },

  /* ─── Menu no celular ────────────────────────────────────── */
  _setupMenu(nav) {
    const burger = nav.querySelector('#daiNavBurger');
    const overlay = nav.querySelector('#daiNavOverlay');
    const fecha = () => {
      nav.classList.remove('dai-nav--open');
      document.body.classList.remove('dai-nav-locked');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Abrir menu');
    };
    const abre = () => {
      nav.classList.add('dai-nav--open');
      document.body.classList.add('dai-nav-locked');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Fechar menu');
    };
    burger.addEventListener('click', () => nav.classList.contains('dai-nav--open') ? fecha() : abre());
    overlay.addEventListener('click', fecha);
    nav.querySelectorAll('.dai-nav__links a').forEach(a => a.addEventListener('click', fecha));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fecha(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 860) fecha(); });
  },

  /* ─── Footer ─────────────────────────────────────────────── */
  _injectFooter() {
    const footer = document.createElement('footer');
    footer.className = 'dai-footer';
    footer.innerHTML = `
      <div class="dai-footer__inner">
        <span class="dai-footer__logo"><img class="brand-logo" src="assets/logo-incentivabr-compact.png" alt="IncentivaBR"></span>
        <div class="dai-footer__links">
          <a href="como-funciona.html" class="dai-footer__link">Como funciona</a>
          <a href="faq.html" class="dai-footer__link">Perguntas frequentes</a>
          <a href="espaco-contador.html" class="dai-footer__link">Contadores</a>
          <a href="cadastro-avisos.html" class="dai-footer__link">Receber avisos</a>
          <a href="politica-privacidade.html" class="dai-footer__link">Política de Privacidade</a>
          <a href="termos-uso.html" class="dai-footer__link">Termos de Uso</a>
        </div>
        <p class="dai-footer__legal">Plataforma de destinação de IR pela Lei Rouanet (Lei 8.313/1991). A plataforma não movimenta dinheiro e não substitui contador ou advogado.</p>
      </div>`;

    /* Antes do aviso legal que já está no HTML (marcado pelo comentário
       incentivabr-legal), para a página fechar na ordem: conteúdo, rodapé,
       aviso de propriedade intelectual. */
    const marca = [...document.body.childNodes].find(n => n.nodeType === 8 && String(n.data).includes('incentivabr-legal'));
    if (marca) document.body.insertBefore(footer, marca);
    else document.body.appendChild(footer);
  },

  /* ─── Auth: atualiza link "Entrar" se já logado ─────────── */
  _updateAuth() {
    const el = document.getElementById('daiNavAuth');
    if (!el) return;

    /* auth.js deve ser carregado antes de layout.js */
    if (typeof auth === 'undefined' || !auth.isLoggedIn()) return;

    const user = auth.getUser();
    el.textContent = user?.nome ? user.nome.split(' ')[0] : 'Minha Conta';
    el.href = 'dashboard.html';
  },

  /* ─── Fade-up on scroll ──────────────────────────────────── */
  _setupFadeUp() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.fade-up').forEach(el => obs.observe(el));
  }
};
