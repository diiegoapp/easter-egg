# Easter Egg

Jogo cooperativo 3D para 2 jogadores (2 controles USB ou teclado). Cinco fases de desafio, cada uma libera
uma letra (M, E, N, I, N) e o final revela o sexo do bebê (O ou A). O segredo é digitado por um convidado
numa tela mascarada e só aparece no final.

## Rodar (VS Code)

Pré-requisito: [Node.js LTS](https://nodejs.org) (18 ou mais novo).

```bash
npm install        # só na primeira vez
npm run dev        # abre http://localhost:5173 (recarrega ao salvar)
```

No VS Code: `Ctrl+Shift+B` roda o servidor (tarefa "dev"), e `F5` abre o Chrome/Edge com depuração
(com o servidor rodando). Abra no **Chrome ou Edge**: a Gamepad API só enxerga o controle depois de
apertar um botão com a aba em foco.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera `dist/` (para hospedar) |
| `npm run build:single` | Gera `dist-single/index.html`: **um único arquivo, 100% offline** (use este na festa) |
| `npm run preview` | Serve o build para conferir |

## Estrutura

```
index.html        marcação da interface (segredo, HUD, lobby, banner)
src/main.js       o jogo inteiro (por enquanto num arquivo; ver "Próximos passos")
src/style.css     estilos da interface
public/models/    modelos 3D (glTF/GLB) que forem entrando
public/audio/     músicas e sons
vite.config.js    build normal e build de arquivo único
.vscode/          tarefas, depuração e extensões recomendadas
```

## Depuração

- **Modo ensaio:** na tela do segredo, botão "Fazer um ensaio" (resultado sorteado). Nele, a tecla **N**
  pula a fase atual.
- No `npm run dev`, o console do navegador tem `window.__game` (jogadores, blocos, fase atual, etc.).
  Exemplos: `__game.players[0].x = 0`, `__game.skip()`.
- Constantes de física e dificuldade ficam no topo de `src/main.js`: `GRAV`, `JUMP`, `SPEED`, `LEASH`,
  e `ZS` (início de cada fase). A sequência da fase 5 é `genSeq(5)`.

## Controles

- Controle: analógico move, **A** pula, **B** segura (e comemora fora do final).
- Teclado 1: **WASD** + **Espaço** (pula) + **E** (segura).
- Teclado 2: **Setas** + **Enter** (pula) + **Shift direito** (segura).
- **T** troca os papéis no lobby, **F** tela cheia, **R** reinicia depois da revelação.

## Observações técnicas

- O `three` está **fixado na r128** de propósito: toda a iluminação e as cores foram calibradas para ela.
  Versões novas mudam o gerenciamento de cor e de luz, então a atualização deve ser uma tarefa
  própria (com revisão visual).
- Modelos glTF: coloque em `public/models/` e carregue com
  `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'`.
  Efeitos como bloom: `three/examples/jsm/postprocessing/` (já vêm no pacote).
- A build de arquivo único embute o motor 3D e a fonte, então funciona sem internet.

## Próximos passos (plano até 12/12)

1. Dividir `main.js` em módulos (input, áudio, mundo, personagens, fases, interface, partículas).
2. Trocar os bonequinhos por modelos glTF com animação; melhorar cenário e iluminação (bloom, vinheta).
3. Polimento fase a fase (efeitos de impacto, câmera, dificuldade).
4. Final cinematográfico, música e sons.
5. Testes com os controles reais e o notebook da festa; congelar em 1º/12.
