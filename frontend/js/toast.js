// Toast Notifications - IncentivaBR
// Sistema de notificações visuais para feedback ao usuário

const Toast = (function() {
  'use strict';

  let container = null;

  // Configurações padrão
  const isMobile = () => window.innerWidth <= 480 || ('ontouchstart' in window);

  const defaults = {
    duration: 9000,
    position: 'top-right',
    pauseOnHover: true,
    closeOnClick: true,
    showProgress: true,
    maxToasts: 3
  };

  // Ícones para cada tipo
  const icons = {
    success: '<i class="fas fa-check-circle"></i>',
    error: '<i class="fas fa-times-circle"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>'
  };

  // Inicializa o container
  function init() {
    if (container) return;

    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);

    // Adicionar estilos se não existirem
    if (!document.getElementById('toast-styles')) {
      const styles = document.createElement('style');
      styles.id = 'toast-styles';
      styles.textContent = getStyles();
      document.head.appendChild(styles);
    }
  }

  // Retorna os estilos CSS
  function getStyles() {
    return `
      .toast-container {
        position: fixed;
        z-index: 99999;
        pointer-events: none;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 100%;
        box-sizing: border-box;
      }

      .toast-container.top-right {
        top: 0;
        right: 0;
        align-items: flex-end;
      }

      .toast-container.top-left {
        top: 0;
        left: 0;
        align-items: flex-start;
      }

      .toast-container.bottom-right {
        bottom: 0;
        right: 0;
        align-items: flex-end;
      }

      .toast-container.bottom-left {
        bottom: 0;
        left: 0;
        align-items: flex-start;
      }

      .toast-container.top-center {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        align-items: center;
      }

      .toast-container.bottom-center {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        align-items: center;
      }

      .toast {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 18px 22px;
        border-radius: 14px;
        background: white;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.12);
        max-width: 420px;
        min-width: 320px;
        animation: toastSlideIn 0.3s ease-out;
        position: relative;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .toast:hover {
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .toast.removing {
        animation: toastSlideOut 0.3s ease forwards;
      }

      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes toastSlideOut {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100%);
        }
      }

      .toast-container.top-left .toast,
      .toast-container.bottom-left .toast {
        animation-name: toastSlideInLeft;
      }

      .toast-container.top-left .toast.removing,
      .toast-container.bottom-left .toast.removing {
        animation-name: toastSlideOutLeft;
      }

      @keyframes toastSlideInLeft {
        from {
          opacity: 0;
          transform: translateX(-100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes toastSlideOutLeft {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(-100%);
        }
      }

      .toast-container.top-center .toast,
      .toast-container.bottom-center .toast {
        animation-name: toastSlideInCenter;
      }

      .toast-container.top-center .toast.removing,
      .toast-container.bottom-center .toast.removing {
        animation-name: toastSlideOutCenter;
      }

      @keyframes toastSlideInCenter {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes toastSlideOutCenter {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
      }

      .toast-icon {
        font-size: 28px;
        flex-shrink: 0;
        margin-top: 0;
      }

      .toast-content {
        flex: 1;
        min-width: 0;
      }

      .toast-title {
        font-weight: 700;
        font-size: 17px;
        color: #111;
        margin-bottom: 6px;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .toast-message {
        font-size: 15px;
        color: #444;
        line-height: 1.5;
        word-wrap: break-word;
        font-weight: 500;
      }

      .toast-close {
        background: none;
        border: none;
        padding: 10px;
        cursor: pointer;
        color: #777;
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
        border-radius: 6px;
        transition: all 0.2s;
        margin: -4px -8px -4px 0;
        min-width: 40px;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .toast-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #333;
      }

      .toast-dismiss {
        display: block;
        width: 100%;
        margin-top: 12px;
        padding: 11px 16px;
        background: rgba(0, 0, 0, 0.07);
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        color: #222;
        transition: background 0.2s;
        font-family: inherit;
        letter-spacing: 0.01em;
      }

      .toast-dismiss:hover,
      .toast-dismiss:active {
        background: rgba(0, 0, 0, 0.13);
      }

      .toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 5px;
        border-radius: 0 0 14px 14px;
        transition: width linear;
      }

      .toast.paused .toast-progress {
        animation-play-state: paused;
      }

      /* Toast Types */
      .toast.toast-success {
        border-left: 5px solid #00A859;
      }
      .toast.toast-success .toast-icon {
        color: #00A859;
      }
      .toast.toast-success .toast-title {
        color: #007A40;
      }
      .toast.toast-success .toast-progress {
        background: linear-gradient(90deg, #00A859, #00C969);
      }

      .toast.toast-error {
        border-left: 5px solid #E74C3C;
      }
      .toast.toast-error .toast-icon {
        color: #E74C3C;
      }
      .toast.toast-error .toast-title {
        color: #C0392B;
      }
      .toast.toast-error .toast-progress {
        background: linear-gradient(90deg, #E74C3C, #ff6b5b);
      }

      .toast.toast-warning {
        border-left: 5px solid #F7941D;
      }
      .toast.toast-warning .toast-icon {
        color: #F7941D;
      }
      .toast.toast-warning .toast-title {
        color: #D97A00;
      }
      .toast.toast-warning .toast-progress {
        background: linear-gradient(90deg, #F7941D, #FFB800);
      }

      .toast.toast-info {
        border-left: 5px solid #3498DB;
      }
      .toast.toast-info .toast-icon {
        color: #3498DB;
      }
      .toast.toast-info .toast-title {
        color: #2980B9;
      }
      .toast.toast-info .toast-progress {
        background: linear-gradient(90deg, #3498DB, #5dade2);
      }

      /* Mobile Responsive */
      @media (max-width: 480px) {
        .toast-container {
          padding: 12px;
          left: 0 !important;
          right: 0 !important;
          transform: none !important;
        }

        .toast-container.top-right,
        .toast-container.top-left,
        .toast-container.top-center {
          align-items: stretch;
        }

        .toast-container.bottom-right,
        .toast-container.bottom-left,
        .toast-container.bottom-center {
          align-items: stretch;
        }

        .toast {
          max-width: 100%;
          min-width: 0;
          width: 100%;
          padding: 16px 18px;
          gap: 12px;
        }

        .toast-icon {
          font-size: 26px;
        }

        .toast-title {
          font-size: 16px;
        }

        .toast-message {
          font-size: 14px;
        }

        .toast-close {
          font-size: 16px;
          padding: 8px;
        }
      }
    `;
  }

  // Cria e exibe um toast
  function show(options) {
    init();

    // Merge options com defaults
    const opts = { ...defaults, ...options };

    // Atualiza posição do container
    container.className = 'toast-container ' + opts.position;

    // Limita quantidade de toasts
    const currentToasts = container.querySelectorAll('.toast:not(.removing)');
    if (currentToasts.length >= opts.maxToasts) {
      remove(currentToasts[0]);
    }

    // Cria elemento do toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${opts.type || 'info'}`;

    // Monta HTML
    const icon = icons[opts.type] || icons.info;
    // Título e mensagem chegam como texto — muitas vezes a mensagem de erro
    // que o servidor devolveu. Nenhum chamador passa HTML; escapar aqui fecha
    // a porta para todos de uma vez.
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const title = opts.title ? `<div class="toast-title">${esc(opts.title)}</div>` : '';
    const message = opts.message ? `<div class="toast-message">${esc(opts.message)}</div>` : '';
    const hasDismissBtn = opts.duration === 0;

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        ${title}
        ${message}
        ${hasDismissBtn ? '<button class="toast-dismiss">Entendi</button>' : ''}
      </div>
      ${!hasDismissBtn ? `<button class="toast-close" aria-label="Fechar"><i class="fas fa-times"></i></button>` : ''}
      ${opts.showProgress && opts.duration > 0 ? '<div class="toast-progress"></div>' : ''}
    `;

    // Adiciona ao container
    container.appendChild(toast);

    // Timer para auto-close
    let timeoutId = null;
    let startTime = Date.now();
    let remaining = opts.duration;

    if (opts.duration > 0) {
      // Configura barra de progresso
      const progress = toast.querySelector('.toast-progress');
      if (progress) {
        progress.style.width = '100%';
        progress.style.transitionDuration = opts.duration + 'ms';
        // Força reflow para animação funcionar
        progress.offsetHeight;
        progress.style.width = '0%';
      }

      timeoutId = setTimeout(() => remove(toast), opts.duration);

      // Pause on hover (desktop) e toque (mobile)
      if (opts.pauseOnHover) {
        const pause = () => {
          clearTimeout(timeoutId);
          remaining -= Date.now() - startTime;
          toast.classList.add('paused');
          const progress = toast.querySelector('.toast-progress');
          if (progress) {
            const computedWidth = getComputedStyle(progress).width;
            progress.style.transitionDuration = '0ms';
            progress.style.width = computedWidth;
          }
        };
        const resume = () => {
          startTime = Date.now();
          toast.classList.remove('paused');
          const progress = toast.querySelector('.toast-progress');
          if (progress) {
            progress.style.transitionDuration = remaining + 'ms';
            progress.style.width = '0%';
          }
          timeoutId = setTimeout(() => remove(toast), remaining);
        };

        toast.addEventListener('mouseenter', pause);
        toast.addEventListener('mouseleave', resume);
        toast.addEventListener('touchstart', pause, { passive: true });
        toast.addEventListener('touchend', resume, { passive: true });
      }
    }

    // Close on click
    if (opts.closeOnClick) {
      toast.addEventListener('click', (e) => {
        if (!e.target.closest('.toast-close')) {
          remove(toast);
        }
      });
    }

    // Close button (X) — só existe quando há timer
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(timeoutId);
        remove(toast);
      });
    }

    // Dismiss button — existe quando duration === 0
    const dismissBtn = toast.querySelector('.toast-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(toast);
      });
    }

    // Callback
    if (typeof opts.onShow === 'function') {
      opts.onShow(toast);
    }

    return toast;
  }

  // Remove um toast com animação
  function remove(toast) {
    if (!toast || toast.classList.contains('removing')) return;

    toast.classList.add('removing');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // Remove todos os toasts
  function clear() {
    if (!container) return;
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach(toast => remove(toast));
  }

  // Atalhos para tipos comuns
  function success(message, title = 'Sucesso!') {
    return show({ type: 'success', title, message, duration: 5000 });
  }

  function error(message, title = 'Erro!') {
    return show({ type: 'error', title, message, duration: 0, closeOnClick: false });
  }

  function warning(message, title = 'Atenção!') {
    return show({ type: 'warning', title, message, duration: 0, closeOnClick: false });
  }

  function info(message, title = '') {
    return show({ type: 'info', title, message });
  }

  // API pública
  return {
    show,
    success,
    error,
    warning,
    info,
    clear,
    remove
  };
})();

// Expor globalmente
window.Toast = Toast;
