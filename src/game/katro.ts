/* ====================================================================
   KATRO — logique pure du mancala malgache (aucune dépendance React).
   Toutes les fonctions exportées sont pures et testables.

   Plateau : number[4][8] — nombre de vato (graines) par lavaka (trou).
     rangée 0 : NORD, rangée extérieure
     rangée 1 : NORD, rangée intérieure   ┐ les deux rangées intérieures
     rangée 2 : SUD,  rangée intérieure   ┘ se font face : [1][i] ↔ [2][i]
     rangée 3 : SUD, rangée extérieure

   Chaque joueur sème sur le circuit fermé (lalana) de SES 16 trous,
   dans le sens anti-horaire (vu par le joueur lui-même).
   ==================================================================== */

export type Board = number[][];
export type Cell = [number, number]; // [ligne, colonne]
export type Player = "SUD" | "NORD";

/* --------------------------------------------------------------------
   CIRCUITS DE SEMIS (lalana) — définis explicitement, sens anti-horaire.

   SUD (assis en bas) : anti-horaire vu du bas =
     sa rangée intérieure (2) parcourue de DROITE à GAUCHE (col. 7 → 0),
     puis descente à gauche et rangée extérieure (3) de GAUCHE à DROITE.

   NORD (assis en haut) : anti-horaire vu du haut =
     sa rangée intérieure (1) parcourue de GAUCHE à DROITE (col. 0 → 7),
     puis montée à droite et rangée extérieure (0) de DROITE à GAUCHE.

   Les deux circuits tournent donc en miroir l'un de l'autre à l'écran,
   exactement comme autour d'un vrai plateau partagé.
   -------------------------------------------------------------------- */
export const CIRCUIT_SUD: Cell[] = [
  [2, 7], [2, 6], [2, 5], [2, 4], [2, 3], [2, 2], [2, 1], [2, 0],
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7],
];

export const CIRCUIT_NORD: Cell[] = [
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
  [0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0],
];

/* --------------------------------------------------------------------
   MISE EN PLACE : 2 vato dans chacun des 32 trous (64 graines au total).

   ⚠ La disposition initiale VARIE SELON LES RÉGIONS DE MADAGASCAR
   (variantes sakalava, merina, antandroy…) : certains villages ne
   remplissent que 4 trous par camp, d'autres mettent 3 graines…
   Modifiez librement ce tableau (4 lignes × 8 entiers ≥ 0).
   -------------------------------------------------------------------- */
export const INITIAL_SETUP: Board = [
  [2, 2, 2, 2, 2, 2, 2, 2], // rangée 0 — NORD extérieure
  [2, 2, 2, 2, 2, 2, 2, 2], // rangée 1 — NORD intérieure
  [2, 2, 2, 2, 2, 2, 2, 2], // rangée 2 — SUD intérieure
  [2, 2, 2, 2, 2, 2, 2, 2], // rangée 3 — SUD extérieure
];

/** Protection anti-boucle infinie : nombre maximal d'itérations
 *  (graines semées + relais/captures en chaîne) autorisées par tour. */
export const MAX_TURN_ITERATIONS = 500;

const CIRCUIT_OF: Record<Player, Cell[]> = { SUD: CIRCUIT_SUD, NORD: CIRCUIT_NORD };

/** Index précalculé de chaque trou dans chaque circuit (-1 = hors circuit). */
const CIRCUIT_INDEX: Record<Player, number[][]> = (() => {
  const make = (circuit: Cell[]) => {
    const t = Array.from({ length: 4 }, () => Array(8).fill(-1));
    circuit.forEach(([r, c], i) => (t[r][c] = i));
    return t;
  };
  return { SUD: make(CIRCUIT_SUD), NORD: make(CIRCUIT_NORD) };
})();

export const circuitOf = (p: Player): Cell[] => CIRCUIT_OF[p];
export const circuitIndexOf = (p: Player, [r, c]: Cell): number => CIRCUIT_INDEX[p][r][c];
export const other = (p: Player): Player => (p === "SUD" ? "NORD" : "SUD");

/** Nouveau plateau, copie profonde de INITIAL_SETUP. */
export const freshBoard = (): Board => INITIAL_SETUP.map((row) => row.slice());

const cloneBoard = (b: Board): Board => b.map((row) => row.slice());

/** Nombre de graines actuellement sur le plateau pour un camp. */
export function countSeeds(board: Board, player: Player): number {
  const rows = player === "SUD" ? [2, 3] : [0, 1];
  return rows.reduce((s, r) => s + board[r].reduce((a, b) => a + b, 0), 0);
}

/** Coups légaux : tous les trous du camp contenant au moins 2 graines. */
export function getLegalMoves(board: Board, player: Player): Cell[] {
  return CIRCUIT_OF[player].filter(([r, c]) => board[r][c] >= 2);
}

/** Un joueur qui ne peut effectuer aucun coup légal a PERDU. */
export function isGameOver(board: Board, player: Player): boolean {
  return getLegalMoves(board, player).length === 0;
}

/* --------------------------------------------------------------------
   EXÉCUTION D'UN TOUR
   -------------------------------------------------------------------- */
export interface Step {
  board: Board; // instantané APRÈS l'action (pour l'animation)
  kind: "pickup" | "sow" | "capture" | "end";
  cell: Cell; // trou concerné
}

export interface MoveResult {
  board: Board; // plateau final du tour
  captures: number; // graines capturées pendant ce tour
  steps: Step[]; // états intermédiaires (vide si record = false)
}

/**
 * Joue `hole` pour `player` et déroule TOUT le tour :
 * semis → capture éventuelle → relais éventuels → … → trou vide.
 *
 * Détection de capture : la dernière graine doit tomber dans un trou
 * NON VIDE (≥ 1 graine avant la chute) de la rangée INTÉRIEURE du joueur,
 * ET le trou opposé (même colonne) de la rangée intérieure adverse doit
 * être non vide. Les graines adverses sont alors prises et ressémées
 * immédiatement dans le circuit du joueur, en repartant du trou de capture.
 *
 * Relais : la dernière graine tombe dans un trou non vide sans capture
 * possible → on ramasse tout ce trou et on continue de semer.
 *
 * Fin de tour : la dernière graine tombe dans un trou vide.
 *
 * @param record true = enregistre chaque étape (UI) ; false = version
 *               rapide sans snapshots (utilisée par le minimax).
 */
function executeTurn(
  start: Board,
  player: Player,
  hole: Cell,
  record: boolean
): MoveResult {
  const b = cloneBoard(start);
  const circuit = CIRCUIT_OF[player];
  const innerRow = player === "SUD" ? 2 : 1; // rangée intérieure du joueur
  const oppInnerRow = player === "SUD" ? 1 : 2; // rangée intérieure adverse
  const steps: Step[] = [];
  let captures = 0;
  let iter = 0;

  const push = (kind: Step["kind"], cell: Cell) => {
    if (record) steps.push({ board: cloneBoard(b), kind, cell });
  };

  // On vide le trou choisi ; le semis démarre au trou SUIVANT du circuit
  // (le trou d'origine ne reçoit jamais la première graine).
  let idx = CIRCUIT_INDEX[player][hole[0]][hole[1]];
  let seeds = b[hole[0]][hole[1]];
  b[hole[0]][hole[1]] = 0;
  push("pickup", hole);

  // Boucle principale : un passage = un semis complet de `seeds` graines,
  // puis décision (capture / relais / fin) sur le trou d'arrivée.
  for (;;) {
    for (let k = 1; k <= seeds; k++) {
      const [r, c] = circuit[(idx + k) % 16];
      b[r][c] += 1;
      push("sow", [r, c]);
      if (++iter >= MAX_TURN_ITERATIONS) {
        // Chaîne pathologique (relais infinis) : on coupe le tour ici.
        push("end", [r, c]);
        return { board: b, captures, steps };
      }
    }
    idx = (idx + seeds) % 16; // index du trou d'arrivée
    const [lr, lc] = circuit[idx];

    // Trou d'arrivée non vide avant la chute ⇔ ≥ 2 graines après la chute.
    if (b[lr][lc] >= 2) {
      if (lr === innerRow && b[oppInnerRow][lc] > 0) {
        /* ---- CAPTURE ---- trou intérieur + opposé adverse non vide :
           on ramasse l'opposé et on ressème le butin depuis le trou de
           capture (le semis suivant repart donc en idx + 1). */
        const taken = b[oppInnerRow][lc];
        b[oppInnerRow][lc] = 0;
        captures += taken;
        push("capture", [oppInnerRow, lc]);
        seeds = taken;
        if (++iter >= MAX_TURN_ITERATIONS) {
          push("end", [lr, lc]);
          return { board: b, captures, steps };
        }
        continue; // le tour continue — captures en chaîne possibles
      }
      /* ---- RELAIS ---- pas de capture possible : on ramasse tout le
         trou d'arrivée (graines présentes + celle qu'on vient de poser)
         et on poursuit le semis à partir du trou suivant. */
      seeds = b[lr][lc];
      b[lr][lc] = 0;
      push("pickup", [lr, lc]);
      if (++iter >= MAX_TURN_ITERATIONS) {
        push("end", [lr, lc]);
        return { board: b, captures, steps };
      }
      continue;
    }

    /* ---- FIN DE TOUR ---- la dernière graine est tombée dans un trou
       qui était vide : le semis s'arrête. */
    push("end", [lr, lc]);
    return { board: b, captures, steps };
  }
}

/** Version publique avec étapes d'animation (pour l'UI). */
export function applyMove(board: Board, player: Player, hole: Cell): MoveResult {
  return executeTurn(board, player, hole, true);
}

/* --------------------------------------------------------------------
   IA — minimax avec élagage alpha-bêta
   -------------------------------------------------------------------- */
export type AiLevel = "facile" | "moyen" | "difficile";

/** Évaluation du plateau du point de vue de `ai` :
 *  (graines du camp) − (graines adverses) + bonus pour les trous de la
 *  rangée intérieure « bien garnis » (≥ 2 graines : ce sont des munitions
 *  de capture et des prises potentielles à éviter). */
function innerBonus(board: Board, player: Player): number {
  const row = player === "SUD" ? 2 : 1;
  let bonus = 0;
  for (let c = 0; c < 8; c++) if (board[row][c] >= 2) bonus += 3;
  return bonus;
}

export function evaluate(board: Board, ai: Player): number {
  return (
    countSeeds(board, ai) -
    countSeeds(board, other(ai)) +
    innerBonus(board, ai) -
    innerBonus(board, other(ai))
  );
}

/** Minimax (alpha-bêta). `depth` = nombre de plies restants.
 *  Un camp sans coup légal a perdu : score terminal ±(10000 + depth)
 *  pour préférer les victoires rapides et les défaites tardives. */
function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  ai: Player
): number {
  const player = maximizing ? ai : other(ai);
  const moves = getLegalMoves(board, player);
  if (moves.length === 0) return (maximizing ? -1 : 1) * (10000 + depth);
  if (depth === 0) return evaluate(board, ai);

  // Ordre des coups : d'abord ceux qui capturent (améliore l'élagage).
  const ordered = moves
    .map((m) => ({ m, cap: executeTurn(board, player, m, false).captures }))
    .sort((a, b) => b.cap - a.cap);

  if (maximizing) {
    let best = -Infinity;
    for (const { m } of ordered) {
      const v = minimax(executeTurn(board, player, m, false).board, depth - 1, alpha, beta, false, ai);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const { m } of ordered) {
    const v = minimax(executeTurn(board, player, m, false).board, depth - 1, alpha, beta, true, ai);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

/** Choisit le coup de l'IA.
 *  Facile = coup aléatoire · Moyen = profondeur 2 · Difficile = profondeur 4. */
export function chooseAiMove(board: Board, ai: Player, level: AiLevel): Cell {
  const moves = getLegalMoves(board, ai);
  if (moves.length === 0) throw new Error("Aucun coup légal pour l'IA");
  if (level === "facile") return moves[Math.floor(Math.random() * moves.length)];

  const depth = level === "moyen" ? 2 : 4;
  let bestScore = -Infinity;
  let bestMoves: Cell[] = [];
  for (const m of moves) {
    const after = executeTurn(board, ai, m, false).board;
    const v = minimax(after, depth - 1, -Infinity, Infinity, false, ai);
    if (v > bestScore) {
      bestScore = v;
      bestMoves = [m];
    } else if (v === bestScore) {
      bestMoves.push(m);
    }
  }
  // Départage aléatoire entre coups équivalents (parties variées).
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
