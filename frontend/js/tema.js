/* ═══════════════════════════════════════════════════════════
   tema.js — a paleta única do Tailwind (Play CDN)

   Carregar logo depois do script do Tailwind:
     <script src="https://cdn.tailwindcss.com"></script>
     <script src="js/tema.js"></script>

   Por que existe: o Raio-X de set/2026 (risco 11) contou 14 blocos
   `tailwind.config` copiados de página em página, com quatro paletas
   diferentes — `navy` era #273F77 numa página e #0F1E3D na outra, `gold`
   era fixo numa e `var(--secondary-color)` na seguinte. Este arquivo é o
   único lugar onde os nomes de cor do Tailwind são definidos.

   Decisão de set/2026: o azul da interface é o navy #0F1E3D. O #273F77 do
   manual da marca fica para o logotipo e o material impresso.

   O acento (`gold`, `orange`) sai de --secondary-rgb, que tenant.js escreve a
   partir da cor da organização — assim `bg-gold/20` e `text-gold/80`
   continuam funcionando com transparência, o que `var(--secondary-color)`
   direto não permite. Sem tenant.js, cai no laranja da IncentivaBR.
   ═══════════════════════════════════════════════════════════ */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Montserrat', 'sans-serif'] },
      colors: {
        navy:        '#0F1E3D',
        navydeep:    '#0F1E3D',
        navydark:    '#0A1530',
        navymid:     '#132247',
        gold:        'rgb(var(--secondary-rgb, 238 152 92) / <alpha-value>)',
        orange:      'rgb(var(--secondary-rgb, 238 152 92) / <alpha-value>)',
        golddk:      'var(--secondary-hover, #D4874E)',
        orangelight: '#F5B483',
        light:       '#EDEDED'
      }
    }
  }
};
