/* Test rapide (node scripts/test-katro.mjs) — logique pure du katro. */
import {
  INITIAL_SETUP, CIRCUIT_SUD, CIRCUIT_NORD, applyMove, getLegalMoves,
  isGameOver, countSeeds, chooseAiMove, evaluate, freshBoard,
} from "../src/game/katro.ts";

let ok = 0, ko = 0;
const check = (name, cond) => { cond ? ok++ : (ko++, console.error("  ✗", name)); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const key = ([r, c]) => `${r},${c}`;
const emptySud = (b) => { for (let r = 2; r < 4; r++) for (let c = 0; c < 8; c++) b[r][c] = 0; };
const emptyNordInner = (b) => { for (let c = 0; c < 8; c++) b[1][c] = 0; };

/* 1. Setup : 64 graines, 16 coups légaux par camp */
check("setup 64 graines", countSeeds(INITIAL_SETUP, "SUD") + countSeeds(INITIAL_SETUP, "NORD") === 64);
check("16 coups SUD", getLegalMoves(INITIAL_SETUP, "SUD").length === 16);
check("16 coups NORD", getLegalMoves(INITIAL_SETUP, "NORD").length === 16);

/* 2. Circuits anti-horaires en miroir */
check("sud: intérieure 2 droite→gauche", eq(CIRCUIT_SUD[0], [2, 7]) && eq(CIRCUIT_SUD[7], [2, 0]));
check("sud: extérieure 3 gauche→droite", eq(CIRCUIT_SUD[8], [3, 0]) && eq(CIRCUIT_SUD[15], [3, 7]));
check("nord: intérieure 1 gauche→droite", eq(CIRCUIT_NORD[0], [1, 0]) && eq(CIRCUIT_NORD[7], [1, 7]));
check("nord: extérieure 0 droite→gauche", eq(CIRCUIT_NORD[8], [0, 7]) && eq(CIRCUIT_NORD[15], [0, 0]));

/* 3. Semis simple : [3,0] avec 2 graines → [3,1] puis [3,2], tour fini */
{
  const b = freshBoard(); emptySud(b);
  b[3][0] = 2;
  const total = countSeeds(b, "SUD") + countSeeds(b, "NORD");
  const res = applyMove(b, "SUD", [3, 0]);
  check("semis dépose 1+1", res.board[3][0] === 0 && res.board[3][1] === 1 && res.board[3][2] === 1);
  check("aucune capture", res.captures === 0);
  check("dernière étape = end en [3,2]", res.steps.at(-1).kind === "end" && key(res.steps.at(-1).cell) === "3,2");
  check("somme conservée", countSeeds(res.board, "SUD") + countSeeds(res.board, "NORD") === total);
}

/* 4. Relais : dernière graine sur trou non vide → ramasse et continue */
{
  const b = freshBoard(); emptySud(b);
  b[3][0] = 2; b[3][2] = 1;
  const res = applyMove(b, "SUD", [3, 0]);
  // semis : [3,1]=1, [3,2]=1+1=2 → chute non vide → relais :
  // ramasse 2 → [3,3]=1, [3,4]=1 → chute [3,4] (vide avant) → fin
  check("relais continue", res.board[3][1] === 1 && res.board[3][2] === 0 && res.board[3][3] === 1 && res.board[3][4] === 1);
  check("relais : 2 pickups", res.steps.filter((s) => s.kind === "pickup").length === 2);
  check("relais : fin en [3,4]", res.steps.at(-1).kind === "end" && key(res.steps.at(-1).cell) === "3,4");
}

/* 5a. Chute intérieure mais opposé VIDE → pas de capture, simple relais */
{
  const b = freshBoard(); emptySud(b); emptyNordInner(b);
  b[2][7] = 2; b[2][5] = 1;
  const res = applyMove(b, "SUD", [2, 7]);
  // [2,6]=1, [2,5]=2 → opposé [1,5]=0 → relais → [2,4]=1,[2,3]=1 → fin
  check("pas de capture si opposé vide", res.captures === 0);
  check("relais intérieur ok", res.board[2][5] === 0 && res.board[2][4] === 1 && res.board[2][3] === 1);
}

/* 5b. Capture : chute intérieure non vide + opposé non vide → butin ressemé */
{
  const b = freshBoard(); emptySud(b); emptyNordInner(b);
  b[2][7] = 2; b[2][5] = 1; b[1][5] = 4;
  const preSud = countSeeds(b, "SUD"), preNord = countSeeds(b, "NORD");
  const res = applyMove(b, "SUD", [2, 7]);
  // chute [2,5]=2, opposé [1,5]=4 → capture 4 → ressème depuis [2,5] :
  // [2,4],[2,3],[2,2],[2,1] reçoivent 1 → chute [2,1] (vide avant) → fin
  check("capture du butin (4)", res.captures === 4);
  check("opposé vidé", res.board[1][5] === 0);
  check("trou de chute intact", res.board[2][5] === 2);
  check("butin ressemé", res.board[2][4] === 1 && res.board[2][1] === 1 && res.board[3][0] === 0);
  check("étape capture en [1,5]", res.steps.some((s) => s.kind === "capture" && key(s.cell) === "1,5"));
  check(
    "transfert exact (SUD+N / NORD−N)",
    countSeeds(res.board, "SUD") === preSud + res.captures && countSeeds(res.board, "NORD") === preNord - res.captures
  );
}

/* 5c. Captures en chaîne : deux captures dans le même tour */
{
  const b = freshBoard(); emptySud(b); emptyNordInner(b);
  b[2][7] = 2; b[2][5] = 1; b[2][3] = 1; b[1][5] = 3; b[1][3] = 5;
  const res = applyMove(b, "SUD", [2, 7]);
  // chute [2,5]=2 → capture 3 → ressème : [2,4]=1, [2,3]=2, [2,2]=1
  // chute [2,3]=2 → capture 5 → ressème : [2,2]=2, [2,1],[2,0],[3,0],[3,1]=1
  // chute [3,1] : rangée extérieure, vide avant → fin
  check("chaîne : 3 + 5 capturés", res.captures === 8);
  check("chaîne : deux opposés vidés", res.board[1][5] === 0 && res.board[1][3] === 0);
  check("chaîne : deux étapes capture", res.steps.filter((s) => s.kind === "capture").length === 2);
  check("chaîne : fin en [3,1]", res.steps.at(-1).kind === "end" && key(res.steps.at(-1).cell) === "3,1");
  check(
    "chaîne : graines conservées",
    countSeeds(res.board, "SUD") + countSeeds(res.board, "NORD") === countSeeds(b, "SUD") + countSeeds(b, "NORD")
  );
}

/* 6. Fin de partie : plus aucun trou à ≥ 2 graines = perdu */
{
  const b = freshBoard();
  for (let c = 0; c < 8; c++) { b[2][c] = 1; b[3][c] = 0; }
  check("SUD bloqué → game over", isGameOver(b, "SUD") && getLegalMoves(b, "SUD").length === 0);
  check("NORD peut encore jouer", !isGameOver(b, "NORD"));
}

/* 7. Protection anti-boucle : position dégénérée coupée vite et bornée */
{
  const b = freshBoard();
  for (let c = 0; c < 8; c++) b[2][c] = 17; // tout est plein : chaînes très longues
  const t0 = Date.now();
  const res = applyMove(b, "SUD", [2, 0]);
  check("position dégénérée < 1 s", Date.now() - t0 < 1000);
  check("étapes bornées (~500 itérations)", res.steps.length <= 506);
  check("somme conservée malgré la coupe", countSeeds(res.board, "SUD") + countSeeds(res.board, "NORD") === 64);
}

/* 8. IA : coups légaux aux trois niveaux + cohérence de l'évaluation */
{
  const b = freshBoard(); emptySud(b);
  b[2][7] = 16; b[1][7] = 7;
  for (const lvl of ["facile", "moyen", "difficile"]) {
    const mv = chooseAiMove(b, "NORD", lvl);
    check(`IA ${lvl} joue un coup légal`, b[mv[0]][mv[1]] >= 2 && mv[0] <= 1);
  }
  check("symétrie d'évaluation (départ = 0)", evaluate(freshBoard(), "NORD") === 0);
  const win = freshBoard();
  for (let c = 0; c < 8; c++) { win[2][c] = 1; win[3][c] = 0; }
  check("l'IA préfère un Sud bloqué", evaluate(win, "NORD") > evaluate(freshBoard(), "NORD"));
}

console.log(ko === 0 ? `✔ ${ok} tests passés` : `✘ ${ko} échec(s) / ${ok} ok`);
process.exit(ko === 0 ? 0 : 1);
