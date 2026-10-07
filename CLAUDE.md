# Easter Egg — CLAUDE.md

## O que é este projeto

Jogo cooperativo 3D para 2 jogadores (Papai e Mamãe) criado para um chá revelação de bebê.
Cada jogador usa um controle USB ou metade do teclado; ao completar 5 fases, as letras M-E-N-I-N
são reveladas uma a uma e o bloco final exibe O ou A (MENINO / MENINA).

O segredo do bebê é digitado por um convidado antes de começar, fica **só na memória da aba**
e nunca aparece em nenhuma tela ou log. O jogo roda inteiramente no navegador (Chrome ou Edge
com WebGL), sem servidor. O build offline (`npm run build:single`) gera um único HTML que
funciona sem internet — esse arquivo precisa estar pronto para a **festa em 12/12**.

## Comandos

```bash
npm install          # instalar dependências (só na primeira vez)
npm run dev          # servidor de desenvolvimento em http://localhost:5173
npm test             # rodar a suíte de testes (tests/simulate.mjs)
npm run build        # gera dist/ (para hospedar)
npm run build:single # gera dist-single/index.html — arquivo único, 100% offline (usar na festa)
npm run preview      # serve o build para conferir
```

## Regras fixas — não negociáveis

### Three.js travado na r128
`three` está fixado em `0.128.0` no package.json de propósito: toda a iluminação e paleta de
cores foram calibradas para essa versão. Versões novas mudam o gerenciamento de cor e de luz.
**Não atualize o three** sem fazer uma revisão visual completa e criar uma tarefa específica
para isso.

### O segredo nunca pode vazar
- Proibido gravar o valor de `SECRET` em `localStorage`, `sessionStorage`, cookie ou qualquer
  outra forma de persistência.
- Proibido chamar `console.log`, `console.warn` ou qualquer log com o valor de `SECRET` ou
  com qualquer string derivada dele.
- O dado circula apenas na variável `let SECRET` em memória, é apagado dos campos de input
  imediatamente após a leitura e nunca é serializado.

### Contrato `window.__game`
O objeto `window.__game` exposto em modo DEV é usado pelos testes automatizados em
`tests/simulate.mjs`. Mantenha sempre estas propriedades acessíveis:

```js
window.__game = {
  players,   // array com os 2 jogadores
  blocks,    // array com os 6 blocos
  solids,    // array de sólidos de colisão
  stage1,    // estado da fase 1
  elev,      // estado do elevador (fase 3)
  simon,     // estado da fase de memória (fase 5)
  fin,       // estado do bloco final
  pads,      // discos da fase 5
  sweepers,  // vassouras da fase 4
  plates,    // botões da fase 1
  scene,     // THREE.Scene
  camera,    // THREE.Camera
  get state() { return state; },
  get cur()   { return cur; },
  skip: debugSkip   // pula a fase atual (só modo ensaio)
}
```

Qualquer refatoração que quebre esse contrato deve atualizar `tests/simulate.mjs`
**na mesma tarefa**, não em separado.

### Toda mudança deve passar nos testes e no build
Antes de considerar uma alteração concluída:

```bash
npm test             # deve terminar sem erros
npm run build        # deve gerar dist/ sem erros
```

### Mensagens de commit em português
Escreva as mensagens de commit em português, no imperativo, descrevendo o que a mudança faz.
Exemplos: `adiciona suporte a gamepad`, `corrige colisão na fase 2`, `refatora módulo de áudio`.
