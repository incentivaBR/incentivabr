// TINA - Assistente Virtual IncentivaBR (powered by Claude AI)

const TINA = (function() {
  'use strict';

  let isOpen = false;
  let container = null;
  let conversationHistory = [];

  // Configurações
  const config = {
    whatsappNumber: '5561999682929',
    whatsappMessage: 'Olá! Tenho dúvidas sobre destinação de IR via Lei Rouanet.',
    botName: 'TINA',
    botAvatar: '<img src="assets/tina-avatar.svg" alt="TINA" style="width:100%;height:100%;border-radius:50%;object-fit:cover">',
    userAvatar: '👤'
  };

  // Respostas da TINA organizadas por categoria
  // Respostas de contingência — NÃO são atalho.
  //
  // A TINA responde pela API (/api/chat/tina), que carrega a base de
  // conhecimento completa. O fetch acontece primeiro e sempre vence; estas
  // respostas só aparecem quando a API falha: rede fora, chave ausente, 5xx.
  //
  // Antes havia 26 categorias herdadas do piloto FGV, falando de "simulação",
  // "pós-teste" e "esta pesquisa" — conteúdo que ficou órfão quando as páginas
  // do piloto viraram redirect para a index. Um fallback que informa errado é
  // pior que um fallback curto, então ficaram cinco, genéricas e conservadoras.
  //
  // Regra ao editar: nada aqui pode somar limites de mecanismos diferentes nem
  // afirmar que se acumulam — é a mesma guarda que existe no prompt do backend.
  const respostas = {

    limite: {
      keywords: ['limite', 'quanto posso', 'percentual', 'teto', 'máximo', 'maximo'],
      // Função, não texto fixo: o percentual vem do banco (window.FISCAL,
      // preenchido por tenant.js a partir de /api/config/brand). Sem ele, o
      // valor de reserva é o conservador.
      response: () => {
        const f = window.FISCAL;
        const teto = f ? f.teto.percentual_texto : '6%';
        const base = f ? f.teto.base_legal : 'Lei 9.532/1997, art. 22';
        return `O teto é <strong>${teto} do IR devido</strong> (${base}), e é um só: ` +
          'Lei Rouanet, fundos da Criança e do Idoso, audiovisual e, para pessoa física, o incentivo ao esporte ' +
          'dividem esse mesmo limite — os percentuais não se somam.<br><br>' +
          'PRONON e PRONAS ficam fora, com limite próprio menor, conjunto entre os dois.<br><br>' +
          'Use a <strong>calculadora</strong> para a estimativa e confirme com o seu contador antes de destinar.';
      }
    },

    ir: {
      keywords: ['ir devido', 'imposto devido', 'onde acho', 'onde fica', 'encontrar'],
      response: 'O que vale é o <strong>IR Devido</strong> — não o salário nem o total retido no ano.<br><br>' +
        'Ele aparece na ficha <em>Resumo da Declaração</em>, na linha "Imposto sobre a renda devido". ' +
        'Se você ainda não declarou este ano, a declaração do ano anterior serve de estimativa.<br><br>' +
        'Sem IR devido não há o que destinar: quem é isento não usa o mecanismo.'
    },

    declaracao: {
      keywords: ['declaração', 'declaracao', 'declarar', 'completa', 'simplificada'],
      response: 'Destinar exige o <strong>modelo completo</strong> da declaração. ' +
        'No modelo simplificado não há como lançar a destinação.<br><br>' +
        'O lançamento é feito na ficha de incentivos fiscais correspondente ao mecanismo que você usou — ' +
        'cada lei tem a sua. O contador confirma qual é a ficha certa no seu caso.'
    },

    comprovante: {
      keywords: ['comprovante', 'recibo', 'documento', 'guardar', 'prova'],
      response: 'Guarde dois papéis: o <strong>recibo emitido pelo projeto ou fundo</strong> ' +
        'e o <strong>comprovante bancário</strong> da transferência.<br><br>' +
        'O recibo precisa trazer o CNPJ do beneficiário, o número do projeto, o valor, a data ' +
        'e o seu nome e CPF. A Receita pode pedir por até seis anos.'
    },

    contador: {
      keywords: ['contador', 'contabilidade', 'contadora', 'profissional'],
      response: 'O contador é aliado, não obstáculo. Ele confirma o seu IR devido exato, ' +
        'o limite que cabe no seu caso e a ficha certa da declaração.<br><br>' +
        'Leve a ele o valor que você pretende destinar e o mecanismo escolhido — ' +
        'é uma conversa de cinco minutos que evita erro na malha fina.'
    }

  };

  // Busca resposta baseada na pergunta
  function getResposta(pergunta) {
    const perguntaLower = pergunta.toLowerCase();

    for (const categoria of Object.values(respostas)) {
      for (const keyword of categoria.keywords) {
        if (perguntaLower.includes(keyword)) {
          return typeof categoria.response === 'function' ? categoria.response() : categoria.response;
        }
      }
    }

    // Resposta padrão
    return '🤖 Sou a <strong>TINA</strong>, assistente da IncentivaBR.<br><br>Posso ajudar com:<br>• Como funciona a destinação de imposto<br>• Quanto você pode destinar e onde achar o IR devido<br>• Os mecanismos de incentivo e seus limites<br>• Como lançar na declaração e guardar o comprovante<br><br>Faça sua pergunta ou clique nos botões abaixo.';
  }

  // Inicializa o widget
  function init() {
    if (container) return;

    // Criar container principal
    container = document.createElement('div');
    container.className = 'tina-container';
    container.innerHTML = getWidgetHTML();
    document.body.appendChild(container);

    // Adicionar estilos
    if (!document.getElementById('tina-styles')) {
      const styles = document.createElement('style');
      styles.id = 'tina-styles';
      styles.textContent = getStyles();
      document.head.appendChild(styles);
    }

    // Event listeners
    setupEventListeners();

    // Mostrar mensagem de boas-vindas após 3 segundos
    setTimeout(() => {
      if (!isOpen) {
        showWelcomeBubble();
      }
    }, 3000);
  }

  // HTML do widget
  function getWidgetHTML() {
    return `
      <!-- Bolha de boas-vindas -->
      <div class="tina-welcome-bubble" id="tinaWelcome">
        <span>Oi! Sou a Tina 👋<br><small style="color:#6B7280">Dúvida sobre destinação de IR?</small></span>
        <button class="tina-welcome-close" onclick="TINA.hideWelcome()">&times;</button>
      </div>

      <!-- Botões flutuantes -->
      <div class="tina-buttons">
        <div style="position:relative;display:inline-flex">
          <button class="tina-fab tina-chat-btn" onclick="TINA.toggle()" title="Falar com TINA" id="tinaChatBtn">
            <img src="assets/tina-avatar.svg" alt="TINA" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
          </button>
          <span id="tinaBadge" style="position:absolute;top:2px;right:2px;width:14px;height:14px;background:#FF4444;border-radius:50%;border:2px solid white;animation:tinaPulse 1.8s infinite"></span>
        </div>
      </div>

      <!-- Chat da TINA -->
      <div class="tina-chat" id="tinaChat">
        <div class="tina-header">
          <div class="tina-header-info">
            <div class="tina-avatar"><img src="assets/tina-avatar.svg" alt="TINA" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div>
            <div>
              <div class="tina-name">TINA</div>
              <div class="tina-status">Assistente IncentivaBR</div>
            </div>
          </div>
          <button class="tina-close" onclick="TINA.close()">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="tina-messages" id="tinaMessages">
          <div class="tina-message tina-bot">
            <div class="tina-msg-avatar"><img src="assets/tina-avatar.svg" alt="TINA" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div>
            <div class="tina-msg-content">
              Olá! Sou a <strong>TINA</strong>, assistente da IncentivaBR. Tire suas dúvidas sobre destinação de imposto de renda: como funciona, quanto você pode destinar e como declarar. 😊
            </div>
          </div>
        </div>

        <div class="tina-quick-actions">
          <button onclick="TINA.ask('Como funciona a destinação de imposto de renda?')">Como funciona?</button>
          <button onclick="TINA.ask('Quanto posso destinar?')">Quanto posso?</button>
          <button onclick="TINA.ask('Como concluo o pós-teste?')">Pós-teste</button>
          <button onclick="TINA.ask('É seguro?')">É seguro?</button>
        </div>

        <div class="tina-input-area">
          <input type="text" id="tinaInput" placeholder="Digite sua pergunta..."
                 onkeypress="if(event.key==='Enter')TINA.send()">
          <button class="tina-send-btn" onclick="TINA.send()">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    `;
  }

  // Estilos CSS
  function getStyles() {
    return `
      .tina-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99998;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      /* Botões flutuantes */
      .tina-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: flex-end;
      }

      .tina-fab {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: white;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        transition: all 0.3s ease;
      }

      .tina-fab:hover {
        transform: scale(1.1);
      }

      .tina-chat-btn {
        width: 72px;
        height: 72px;
        background: transparent;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 4px 24px rgba(0,0,0,0.35);
        border: 3px solid #FFD700;
      }

      .tina-whatsapp {
        background: #25D366;
        width: 48px;
        height: 48px;
        font-size: 22px;
      }

      /* Bolha de boas-vindas */
      .tina-welcome-bubble {
        position: absolute;
        bottom: 70px;
        right: 0;
        background: white;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        display: none;
        align-items: center;
        gap: 12px;
        animation: tinaBounce 0.5s ease;
        white-space: nowrap;
      }

      .tina-welcome-bubble.show {
        display: flex;
      }

      .tina-welcome-close {
        background: none;
        border: none;
        font-size: 18px;
        color: #999;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      @keyframes tinaBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }

      @keyframes tinaPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.7; }
      }

      /* Chat principal */
      .tina-chat {
        position: absolute;
        bottom: 130px;
        right: 0;
        width: 380px;
        height: 520px;
        background: white;
        border-radius: 20px;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.25);
        display: none;
        flex-direction: column;
        overflow: hidden;
        animation: tinaSlideIn 0.3s ease;
      }

      .tina-chat.open {
        display: flex;
      }

      @keyframes tinaSlideIn {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* Header */
      .tina-header {
        background: linear-gradient(135deg, #0D1B3E 0%, #132247 100%);
        color: white;
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .tina-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .tina-avatar {
        width: 40px;
        height: 40px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }

      .tina-name {
        font-weight: 700;
        font-size: 16px;
      }

      .tina-status {
        font-size: 12px;
        opacity: 0.9;
      }

      .tina-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .tina-close:hover {
        background: rgba(255,255,255,0.3);
      }

      /* Mensagens */
      .tina-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .tina-message {
        display: flex;
        gap: 10px;
        max-width: 90%;
      }

      .tina-message.tina-bot {
        align-self: flex-start;
      }

      .tina-message.tina-user {
        align-self: flex-end;
        flex-direction: row-reverse;
      }

      .tina-msg-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #0D1B3E;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
      }

      .tina-user .tina-msg-avatar {
        background: #0D1B3E;
      }

      .tina-msg-content {
        background: #f5f7fa;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        color: #333;
      }

      .tina-user .tina-msg-content {
        background: #0D1B3E;
        color: white;
      }

      .tina-msg-content strong {
        color: inherit;
      }

      /* Ações rápidas */
      .tina-quick-actions {
        padding: 8px 16px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        border-top: 1px solid #eee;
      }

      .tina-quick-actions button {
        background: #f0f2f5;
        border: none;
        padding: 8px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        color: #0D1B3E;
        cursor: pointer;
        transition: all 0.2s;
      }

      .tina-quick-actions button:hover {
        background: #FFD700;
        color: #0D1B3E;
      }

      /* Input */
      .tina-input-area {
        padding: 12px 16px;
        display: flex;
        gap: 10px;
        border-top: 1px solid #eee;
      }

      #tinaInput {
        flex: 1;
        border: 2px solid #eee;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      #tinaInput:focus {
        border-color: #0D1B3E;
      }

      .tina-send-btn {
        background: #FFD700;
        border: none;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        color: #0D1B3E;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .tina-send-btn:hover {
        background: #FFC000;
      }

      /* Typing indicator */
      .tina-typing {
        display: flex;
        gap: 4px;
        padding: 12px 16px;
      }

      .tina-typing span {
        width: 8px;
        height: 8px;
        background: #ccc;
        border-radius: 50%;
        animation: tinaTyping 1.4s infinite;
      }

      .tina-typing span:nth-child(2) { animation-delay: 0.2s; }
      .tina-typing span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes tinaTyping {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }

      /* Mobile */
      @media (max-width: 480px) {
        .tina-container {
          bottom: 16px;
          right: 16px;
        }

        .tina-chat {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          border-radius: 0;
          z-index: 100000;
        }

        .tina-fab {
          width: 52px;
          height: 52px;
          font-size: 22px;
        }

        .tina-whatsapp {
          width: 44px;
          height: 44px;
          font-size: 20px;
        }

        .tina-welcome-bubble {
          right: 60px;
          bottom: 10px;
        }

        .tina-quick-actions button {
          font-size: 11px;
          padding: 6px 12px;
        }
      }
    `;
  }

  // Setup event listeners
  function setupEventListeners() {
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (isOpen && !container.contains(e.target)) {
        close();
      }
    });

    // ESC para fechar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  // Mostrar bolha de boas-vindas
  function showWelcomeBubble() {
    const bubble = document.getElementById('tinaWelcome');
    if (bubble) {
      bubble.classList.add('show');
      setTimeout(() => {
        bubble.classList.remove('show');
      }, 5000);
    }
  }

  // Esconder bolha de boas-vindas
  function hideWelcome() {
    const bubble = document.getElementById('tinaWelcome');
    if (bubble) {
      bubble.classList.remove('show');
    }
  }

  // Toggle chat
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // Abrir chat
  function open() {
    const chat = document.getElementById('tinaChat');
    if (chat) {
      chat.classList.add('open');
      isOpen = true;
      hideWelcome();
      const badge = document.getElementById('tinaBadge');
      if (badge) badge.style.display = 'none';
      document.getElementById('tinaInput')?.focus();
    }
  }

  // Fechar chat
  function close() {
    const chat = document.getElementById('tinaChat');
    if (chat) {
      chat.classList.remove('open');
      isOpen = false;
    }
  }

  // Texto vindo de fora (a pergunta digitada, a resposta do modelo) entra
  // escapado: o que vai em innerHTML tem de ser HTML nosso. As respostas
  // prontas de getResposta() são HTML escrito aqui e passam como estão.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Adicionar mensagem — `content` é HTML já seguro
  function addMessage(content, isUser = false) {
    const messages = document.getElementById('tinaMessages');
    if (!messages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `tina-message ${isUser ? 'tina-user' : 'tina-bot'}`;
    msgDiv.innerHTML = `
      <div class="tina-msg-avatar">${isUser ? config.userAvatar : config.botAvatar}</div>
      <div class="tina-msg-content">${content}</div>
    `;

    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
  }

  // Mostrar indicador de digitação
  function showTyping() {
    const messages = document.getElementById('tinaMessages');
    if (!messages) return;

    const typing = document.createElement('div');
    typing.className = 'tina-message tina-bot';
    typing.id = 'tinaTyping';
    typing.innerHTML = `
      <div class="tina-msg-avatar">${config.botAvatar}</div>
      <div class="tina-msg-content tina-typing">
        <span></span><span></span><span></span>
      </div>
    `;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  // Esconder indicador de digitação
  function hideTyping() {
    const typing = document.getElementById('tinaTyping');
    if (typing) {
      typing.remove();
    }
  }

  // Enviar pergunta (tenta Claude API, usa regras como fallback)
  async function send() {
    const input = document.getElementById('tinaInput');
    if (!input) return;

    const pergunta = input.value.trim();
    if (!pergunta) return;

    addMessage(esc(pergunta), true);
    input.value = '';
    showTyping();

    try {
      const response = await fetch('/api/chat/tina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: pergunta,
          history: conversationHistory.slice(-12)
        })
      });

      hideTyping();

      if (response.ok) {
        const data = await response.json();
        const resposta = data.reply;
        if (!resposta) { addMessage(getResposta(pergunta)); return; }
        conversationHistory.push({ role: 'user', content: pergunta });
        conversationHistory.push({ role: 'assistant', content: resposta });
        // Mantém histórico enxuto
        if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
        // A resposta do modelo é texto, não HTML: escapa e só então troca
        // quebra de linha por <br>.
        addMessage(esc(resposta).replace(/\n/g, '<br>'));
      } else {
        addMessage(getResposta(pergunta));
      }
    } catch (_) {
      hideTyping();
      addMessage(getResposta(pergunta));
    }
  }

  // Pergunta rápida
  function ask(pergunta) {
    const input = document.getElementById('tinaInput');
    if (input) {
      input.value = pergunta;
    }
    send();
  }

  // Abrir WhatsApp
  function openWhatsApp() {
    const message = encodeURIComponent(config.whatsappMessage);
    window.open(`https://wa.me/${config.whatsappNumber}?text=${message}`, '_blank');
  }

  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API pública
  return {
    open,
    close,
    toggle,
    send,
    ask,
    openWhatsApp,
    hideWelcome,
    showWelcomeBubble,
    init: () => {} // auto-inicializado; exposto por compatibilidade com chamadas nas páginas
  };
})();

// Expor globalmente
window.TINA = TINA;
