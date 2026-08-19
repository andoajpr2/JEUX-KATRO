/* ====================================================================
   KATRO — mancala malgache · interface React (un seul fichier composant)
   La logique pure vit dans src/game/katro.ts.
   ==================================================================== */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyMove,
  chooseAiMove,
  circuitIndexOf,
  countSeeds,
  freshBoard,
  getLegalMoves,
  isGameOver,
  other,
  CIRCUIT_SUD,
  MAX_TURN_ITERATIONS,
  type AiLevel,
  type Board,
  type Cell,
  type Player,
  type Step,
} from "./game/katro";

/* ------------------------------------------------------------------ */
/* Petits utilitaires UI                                               */
/* ------------------------------------------------------------------ */

interface Anim {
  steps: Step[];
  index: number;
  player: Player;
  captured: number;
}
interface Fx {
  kind: Step["kind"];
  cell: Cell;
  id: number;
}
interface Preview {
  path: Set<string>;
  land: Cell;
  captureTarget: Cell | null;
  origin: Cell;
}

/** Délai entre deux étapes d'animation (~180 ms par trou ; on accélère
 *  uniquement les tours très longs pour garder la partie lisible). */
function stepDelay(kind: Step["kind"], total: number): number {
  const base = total > 60 ? 45 : total > 30 ? 95 : 180;
  if (kind === "pickup") return Math.round(base * 0.62);
  if (kind === "capture") return Math.round(base * 1.35);
  if (kind === "end") return Math.round(base * 0.8);
  return base;
}

const SEED_COLORS = ["#e9cf9b", "#d9a441", "#c9734a"];

/* Icônes SVG dessinées à la main (aucune dépendance) */
const CrownIcon = () => (
  <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden>
    <path d="M6 34 4 14l11 8 9-12 9 12 11-8-2 20z" fill="#d9a441" stroke="#8a5a20" strokeWidth="2" strokeLinejoin="round" />
    <path d="M6 38h36v4H6z" fill="#c96f45" stroke="#8a5a20" strokeWidth="2" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.6-6.3" />
    <path d="M21 3v6h-6" />
  </svg>
);
const BookIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </svg>
);
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);
const BowlLogo = () => (
  <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
    <ellipse cx="24" cy="30" rx="19" ry="12" fill="#7c4a24" stroke="#d9a441" strokeWidth="1.6" />
    <ellipse cx="24" cy="27" rx="14" ry="8" fill="#4a2b13" />
    <circle cx="18" cy="25" r="2.6" fill="#e9cf9b" />
    <circle cx="25" cy="23.5" r="2.6" fill="#d9a441" />
    <circle cx="31" cy="26" r="2.6" fill="#c9734a" />
    <circle cx="21.5" cy="29.5" r="2.6" fill="#d9a441" />
    <circle cx="28.5" cy="30" r="2.6" fill="#e9cf9b" />
    <path d="M10 12c2-4 6-6 9-5M30 7c3 0 6 2 8 5" stroke="#c96f45" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Graines dessinées en grappe (phyllotaxie = empilement naturel)      */
/* ------------------------------------------------------------------ */
function SeedDots({ count, phase }: { count: number; phase: number }) {
  if (count <= 0) return null;

  if (count > 12) {
    // Trop de vato pour tout dessiner : couronne de points + compteur.
    return (
      <div className="absolute inset-0">
        {Array.from({ length: 8 }, (_, i) => {
          const a = phase + (i * Math.PI) / 4;
          return (
            <span
              key={i}
              className="seed-dot"
              style={{
                left: `${50 + Math.cos(a) * 33}%`,
                top: `${50 + Math.sin(a) * 33}%`,
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.75), rgba(255,255,255,0) 45%), ${SEED_COLORS[i % 3]}`,
              }}
            />
          );
        })}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="seed-badge">{count}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      {Array.from({ length: count }, (_, i) => {
        const a = phase + i * 2.39996323; // angle d'or : grappe organique
        const rad = count === 1 ? 0 : Math.sqrt(i / count) * 29;
        return (
          <span
            key={i}
            className="seed-dot"
            style={{
              left: `${50 + Math.cos(a) * rad}%`,
              top: `${50 + Math.sin(a) * rad}%`,
              background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.75), rgba(255,255,255,0) 45%), ${SEED_COLORS[i % 3]}`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Un trou (lavaka) du plateau                                         */
/* ------------------------------------------------------------------ */
interface HoleProps {
  r: number;
  c: number;
  count: number;
  interactive: boolean; // cliable (tour humain + coup légal)
  dimmed: boolean;
  fx: Fx | null;
  preview: Preview | null;
  isLastAi: boolean;
  delayMs: number;
  onClick: () => void;
  onEnter: () => void;
  onLeave: () => void;
}

function Hole({ r, c, count, interactive, dimmed, fx, preview, isLastAi, delayMs, onClick, onEnter, onLeave }: HoleProps) {
  const key = `${r},${c}`;
  const isOrigin = preview !== null && preview.origin[0] === r && preview.origin[1] === c;
  const inPath = preview !== null && preview.path.has(key);
  const isLand = preview !== null && preview.land[0] === r && preview.land[1] === c;
  const isCap = preview !== null && preview.captureTarget !== null && preview.captureTarget[0] === r && preview.captureTarget[1] === c;

  const pit = (
    <div
      className={`hole-pit${fx && fx.kind === "capture" ? " hole-shake" : ""}${isOrigin ? " preview-origin" : ""}${inPath && !isOrigin ? " preview-path" : ""}${isLand ? " preview-land" : ""}${isCap ? " preview-capture" : ""}`}
    >
      <SeedDots count={count} phase={(r * 8 + c) * 1.7 + 0.6} />
      {fx && <span key={fx.id} className={`fx fx-${fx.kind}`} />}
    </div>
  );

  const shell = `hole-in relative aspect-square w-full${dimmed ? " hole-dim" : ""}`;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        aria-label={`Rangée ${r + 1}, colonne ${c + 1} : ${count} vato — cliquer pour semer`}
        className={`${shell} hole-btn cursor-pointer rounded-full outline-none`}
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {pit}
        {isLastAi && <span className="ai-marker" aria-hidden />}
      </button>
    );
  }
  return (
    <div className={shell} style={{ animationDelay: `${delayMs}ms` }}>
      {pit}
      {isLastAi && <span className="ai-marker" aria-hidden />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ligne de score d'un camp                                            */
/* ------------------------------------------------------------------ */
function ScoreRow({ side, seeds, captures, active, label }: { side: Player; seeds: number; captures: number; active: boolean; label: string }) {
  const color = side === "SUD" ? "#c96f45" : "#7d8f5e";
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-300 ${active ? "bg-[rgba(217,164,65,0.10)]" : ""}`}>
      <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${active ? "pulse-dot" : ""}`} style={{ background: color, boxShadow: `0 0 10px ${color}66` }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold tracking-wide">{label}</div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-[#c9ab7d]">
          captures&nbsp;: <span key={`cap-${side}-${captures}`} className="bump font-extrabold text-[#e9b96a]">{captures}</span>
        </div>
      </div>
      <div className="text-right">
        <div key={`seeds-${side}-${seeds}`} className="bump font-display text-[26px] font-black leading-none text-[#f0ddba]">{seeds}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#c9ab7d]">vato en jeu</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal des règles                                                    */
/* ------------------------------------------------------------------ */
function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const Rule = ({ term, title, children }: { term: string; title: string; children: ReactNode }) => (
    <div className="flex gap-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(201,111,69,0.18)] font-display text-sm font-black text-[#e2a06b] shadow-[inset_0_0_0_1px_rgba(201,111,69,0.35)]">
        {term}
      </div>
      <div>
        <h3 className="font-display text-[17px] font-bold text-[#f0ddba]">{title}</h3>
        <div className="mt-1 text-[13.5px] leading-relaxed text-[#d8c39c]">{children}</div>
      </div>
    </div>
  );

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,7,3,0.72)] p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Règles du katro">
      <div className="modal-in carved-card max-h-[86vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#c96f45]">Lalao · le jeu</div>
            <h2 className="font-display text-3xl font-black text-[#f0ddba]">Règles du katro</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="btn btn-ghost" style={{ padding: "0.55rem" }}>
            <XIcon />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <Rule term="1" title="Le plateau — 4 × 8 lavaka">
            32 trous creusés dans le bois : chaque joueur possède les deux rangées de son côté
            (rangée intérieure face à l'adversaire, rangée extérieure derrière). La mise en place
            classique dépose <strong className="text-[#e9b96a]">2 vato (graines)</strong> dans chaque trou — 64 en tout.
            La disposition initiale varie selon les régions de Madagascar.
          </Rule>
          <Rule term="2" title="Le semis — fanafafy">
            À votre tour, choisissez l'un de vos trous contenant <strong className="text-[#e9b96a]">au moins 2 vato</strong>,
            prenez tout son contenu et semez les graines une à une dans les trous suivants de
            <em> votre</em> circuit de 16 trous (le <strong className="text-[#e9b96a]">lalana</strong>), dans le sens
            anti-horaire. Survolez un trou pour apercevoir le trajet du semis.
          </Rule>
          <Rule term="3" title="La capture">
            Si la dernière graine tombe dans un trou <strong className="text-[#e9b96a]">non vide de votre rangée intérieure</strong> et
            que le trou adverse situé juste en face (rangée intérieure adverse, même colonne) contient des graines :
            vous les <strong className="text-[#e9b96a]">capturez</strong>, puis vous ressèmez immédiatement le butin dans votre
            circuit en repartant du trou de capture. Les captures en chaîne sont possibles !
          </Rule>
          <Rule term="4" title="Le relais">
            Si la dernière graine tombe dans un trou non vide <em>sans</em> capture possible, on ramasse
            tout le contenu de ce trou et l'on continue de semer à la suite. Le semis peut ainsi
            traverser plusieurs fois votre camp.
          </Rule>
          <Rule term="5" title="Fin de tour">
            Le tour s'arrête lorsque la dernière graine tombe dans un trou qui était vide.
            (Par sécurité, un tour ne dépasse jamais {MAX_TURN_ITERATIONS} itérations de relais/captures.)
          </Rule>
          <Rule term="6" title="La victoire">
            Un joueur qui ne peut plus jouer — plus aucun trou d'au moins 2 vato —
            <strong className="text-[#e9b96a]"> perd la partie</strong>. Asseyez votre adversaire : captures et relais
            servent à vider son camp tout en fortifiant le vôtre.
          </Rule>
          <Rule term="7" title="L'adversaire — ny IA">
            Trois niveaux : <strong className="text-[#e9b96a]">Facile</strong> joue au hasard,
            <strong className="text-[#e9b96a]"> Moyen</strong> calcule 2 coups à l'avance et
            <strong className="text-[#e9b96a]"> Difficile</strong> déploie un minimax avec élagage alpha-bêta à 4 coups de profondeur.
          </Rule>
        </div>

        <p className="mt-6 border-t border-[rgba(217,164,65,0.18)] pt-4 text-center text-xs italic text-[#b39a6f]">
          Vato = graines · Lalana = circuit · Lavaka = trou — bon semis, et que le bois vous soit léger.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Graines flottantes d'ambiance (décor)                               */
/* ------------------------------------------------------------------ */
const AMBIENT: Array<[string, number, number, number, number]> = [
  // [couleur, gauche %, haut %, taille px, délai s]
  ["#d9a441", 6, 18, 10, 0], ["#c96f45", 12, 74, 8, 1.4], ["#e9cf9b", 22, 40, 6, 2.6],
  ["#c96f45", 34, 88, 9, 0.8], ["#d9a441", 55, 12, 7, 2.1], ["#e9cf9b", 66, 64, 11, 3.2],
  ["#c96f45", 78, 30, 8, 1.1], ["#d9a441", 88, 78, 10, 2.8], ["#e9cf9b", 93, 44, 6, 0.4],
  ["#c96f45", 45, 95, 7, 3.8], ["#d9a441", 15, 55, 5, 4.4], ["#e9cf9b", 82, 10, 9, 1.9],
];
const AmbientSeeds = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
    {AMBIENT.map(([col, l, t, s, d], i) => (
      <span
        key={i}
        className="float-seed"
        style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, background: col, animationDelay: `${d}s`, animationDuration: `${6 + (i % 4)}s` }}
      />
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [board, setBoard] = useState<Board>(freshBoard); // plateau officiel (après le tour courant)
  const [displayBoard, setDisplayBoard] = useState<Board>(board); // plateau affiché (animé)
  const [turn, setTurn] = useState<Player>("SUD");
  const [captured, setCaptured] = useState<{ SUD: number; NORD: number }>({ SUD: 0, NORD: 0 });
  const [level, setLevel] = useState<AiLevel>("moyen");
  const [anim, setAnim] = useState<Anim | null>(null);
  const [fx, setFx] = useState<Fx | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [hover, setHover] = useState<Cell | null>(null);
  const [lastAi, setLastAi] = useState<Cell | null>(null);

  const humanTurn = turn === "SUD" && !winner && !anim;
  const aiThinking = turn === "NORD" && !winner && !anim;

  /* ---- Coups légaux du joueur dont c'est le tour ---- */
  const legalSet = useMemo(() => {
    const s = new Set<string>();
    getLegalMoves(board, turn).forEach(([r, c]) => s.add(`${r},${c}`));
    return s;
  }, [board, turn]);

  /* ---- Aperçu du semis au survol (SUD uniquement) ---- */
  const preview = useMemo<Preview | null>(() => {
    if (!hover || turn !== "SUD" || anim || winner) return null;
    const seeds = board[hover[0]][hover[1]];
    if (seeds < 2) return null;
    const idx = circuitIndexOf("SUD", hover);
    const path = new Set<string>();
    for (let k = 1; k <= seeds; k++) {
      const [pr, pc] = CIRCUIT_SUD[(idx + k) % 16];
      path.add(`${pr},${pc}`);
    }
    const [lr, lc] = CIRCUIT_SUD[(idx + seeds) % 16]; // trou d'arrivée
    const captureTarget: Cell | null = lr === 2 && board[1][lc] > 0 ? [1, lc] : null;
    return { path, land: [lr, lc], captureTarget, origin: hover };
  }, [hover, turn, anim, winner, board]);

  /* ---- Démarrer un tour (humain ou IA) ---- */
  const startMove = (player: Player, cell: Cell) => {
    if (anim || winner) return;
    const res = applyMove(board, player, cell);
    setHover(null);
    setAnim({ steps: res.steps, index: 0, player, captured: res.captures });
  };

  /* ---- Moteur d'animation : déroule les `steps` un par un ---- */
  useEffect(() => {
    if (!anim) return;

    if (anim.index >= anim.steps.length) {
      // Tour terminé : on fige le plateau officiel et on passe la main.
      const finalBoard = anim.steps[anim.steps.length - 1].board;
      setBoard(finalBoard);
      setDisplayBoard(finalBoard);
      if (anim.captured > 0) {
        setCaptured((prev) => ({ ...prev, [anim.player]: prev[anim.player] + anim.captured }));
      }
      const next = other(anim.player);
      if (isGameOver(finalBoard, next)) setWinner(anim.player);
      else setTurn(next);
      setAnim(null);
      setFx(null);
      return;
    }

    const step = anim.steps[anim.index];
    const t = setTimeout(() => {
      setDisplayBoard(step.board);
      setFx({ kind: step.kind, cell: step.cell, id: anim.index + 1 });
      setAnim((a) => (a ? { ...a, index: a.index + 1 } : a));
    }, stepDelay(step.kind, anim.steps.length));
    return () => clearTimeout(t);
  }, [anim]);

  /* ---- L'IA joue 600 ms après la fin du tour humain ---- */
  useEffect(() => {
    if (!aiThinking) return;
    const t = setTimeout(() => {
      const move = chooseAiMove(board, "NORD", level);
      setLastAi(move);
      startMove("NORD", move);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiThinking, board, level]);

  const newGame = () => {
    const b = freshBoard();
    setBoard(b);
    setDisplayBoard(b);
    setTurn("SUD");
    setCaptured({ SUD: 0, NORD: 0 });
    setAnim(null);
    setFx(null);
    setWinner(null);
    setHover(null);
    setLastAi(null);
  };

  const onHoleClick = (r: number, c: number) => {
    if (!humanTurn || board[r][c] < 2) return;
    startMove("SUD", [r, c]);
  };

  const sudSeeds = useMemo(() => countSeeds(displayBoard, "SUD"), [displayBoard]);
  const nordSeeds = useMemo(() => countSeeds(displayBoard, "NORD"), [displayBoard]);

  const renderRow = (r: number) => (
    <div className="grid grid-cols-8" style={{ gap: "clamp(5px, 1.3vw, 14px)" }}>
      {Array.from({ length: 8 }, (_, c) => {
        const key = `${r},${c}`;
        const isLegal = legalSet.has(key);
        return (
          <Hole
            key={key}
            r={r}
            c={c}
            count={displayBoard[r][c]}
            interactive={humanTurn && isLegal}
            dimmed={!humanTurn && r >= 2}
            fx={fx && fx.cell[0] === r && fx.cell[1] === c ? fx : null}
            preview={preview}
            isLastAi={lastAi !== null && lastAi[0] === r && lastAi[1] === c && turn === "SUD" && !winner}
            delayMs={(r * 8 + c) * 16}
            onClick={() => onHoleClick(r, c)}
            onEnter={() => setHover([r, c])}
            onLeave={() => setHover(null)}
          />
        );
      })}
    </div>
  );

  const statusLine = winner
    ? "La partie est terminée — mpandresy ci-contre."
    : anim
      ? "Semis en cours — les vato suivent le lalana…"
      : aiThinking
        ? "An'ny IA : l'adversaire prépare son coup…"
        : "Survolez un de vos trous (≥ 2 vato) pour voir le trajet du semis, cliquez pour jouer.";

  return (
    <div className="app-bg relative overflow-x-clip">
      <AmbientSeeds />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
        {/* ---------- En-tête ---------- */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <BowlLogo />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.34em] text-[#c96f45]">Mancala malgache</div>
              <h1 className="font-display text-[44px] font-black leading-[0.95] tracking-tight text-[#f0ddba] sm:text-[56px]">
                KATRO
              </h1>
            </div>
          </div>
          <p className="max-w-xs text-right text-[13px] leading-snug text-[#c9ab7d]">
            Jeu de semailles des hauts plateaux&nbsp;: semez, relayez, capturez —
            et laissez l'adversaire à court de <em className="text-[#e9b96a]">vato</em>.
          </p>
        </header>

        <main className="flex flex-col gap-6 lg:flex-row">
          {/* ---------- Plateau ---------- */}
          <section className="min-w-0 flex-1">
            {/* Étiquette NORD */}
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#9db07c]">
                <span className={`h-2.5 w-2.5 rounded-full ${aiThinking ? "pulse-dot" : ""}`} style={{ background: "#7d8f5e" }} />
                Nord · IA — rangées 1 &amp; 0
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f7a55]">lalana anti-horaire ↺</div>
            </div>

            <div className="relative">
              <div className="plank-rim p-2.5 sm:p-3.5">
                <div className="plank relative px-[4%] py-[3.5%]">
                  <div className="lamba-strip mb-[3%] rounded-sm" />
                  <div className="flex flex-col" style={{ gap: "clamp(6px, 1.5vw, 16px)" }}>
                    {renderRow(0)}
                    {renderRow(1)}
                    <div className="carved-divider my-[0.6%]" aria-hidden />
                    {renderRow(2)}
                    {renderRow(3)}
                  </div>
                  <div className="lamba-strip mt-[3%] rounded-sm" />
                </div>
              </div>

              {/* Voile de fin de partie */}
              {winner && (
                <div className="fade-in absolute inset-0 z-20 flex items-center justify-center rounded-[30px] bg-[rgba(15,8,3,0.8)] p-6">
                  <div className="modal-in max-w-md text-center">
                    <div className="mb-2 flex justify-center"><CrownIcon /></div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#d9a441]">Mpandresy · vainqueur</div>
                    <div className="font-display mt-1 text-4xl font-black text-[#f0ddba] sm:text-5xl">
                      {winner === "SUD" ? "SUD — Vous !" : "NORD — L'IA"}
                    </div>
                    <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-[#d8c39c]">
                      {winner === "SUD"
                        ? "L'IA n'a plus aucun coup légal : tous ses trous sont vides ou à une seule graine. Le plateau vous appartient."
                        : "Vous n'avez plus aucun coup légal : plus un seul trou d'au moins 2 vato. Le bois a choisi son camp."}
                    </p>
                    <button type="button" className="btn btn-primary mt-5" onClick={newGame}>
                      <RefreshIcon /> Indray ! — Nouvelle partie
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Étiquette SUD + statut */}
            <div className="mt-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em] text-[#e2a06b]">
                <span className={`h-2.5 w-2.5 rounded-full ${humanTurn ? "pulse-dot" : ""}`} style={{ background: "#c96f45" }} />
                Sud · Anao — rangées 2 &amp; 3
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#8f7a55]">votre lalana ↺</div>
            </div>
            <p className="mt-2 min-h-[20px] px-1 text-[13px] italic text-[#b39a6f]">{statusLine}</p>
          </section>

          {/* ---------- Panneau latéral ---------- */}
          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[310px]">
            {/* Fil du jeu */}
            <div className="carved-card p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.26em] text-[#8f7a55]">Fil du jeu</div>
              {winner ? (
                <div>
                  <div className="font-display text-2xl font-black text-[#e9b96a]">Partie terminée</div>
                  <div className="mt-1 text-[13px] text-[#d8c39c]">Vainqueur : {winner === "SUD" ? "SUD (vous)" : "NORD (IA)"}</div>
                </div>
              ) : anim ? (
                <div>
                  <div className="font-display text-2xl font-black text-[#f0ddba]">
                    {anim.player === "SUD" ? "Votre semis" : "Semis de l'IA"}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[#d8c39c]">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-[#d9a441]" />
                    les graines suivent le lalana…
                  </div>
                </div>
              ) : turn === "SUD" ? (
                <div>
                  <div className="font-display text-2xl font-black text-[#f0ddba]">Anao ! À vous</div>
                  <div className="mt-1 text-[13px] text-[#d8c39c]">Choisissez un trou d'au moins 2 vato.</div>
                </div>
              ) : (
                <div>
                  <div className="font-display text-2xl font-black text-[#f0ddba]">An'ny IA…</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[#d8c39c]">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-[#7d8f5e]" />
                    {level === "facile" ? "l'IA s'en remet au hasard" : level === "moyen" ? "l'IA calcule 2 coups" : "l'IA sonde 4 coups de profondeur"}
                  </div>
                </div>
              )}
            </div>

            {/* Comptes */}
            <div className="carved-card flex flex-col gap-1 p-3">
              <ScoreRow side="NORD" label="NORD — IA" seeds={nordSeeds} captures={captured.NORD} active={!winner && turn === "NORD"} />
              <div className="carved-divider mx-3" aria-hidden />
              <ScoreRow side="SUD" label="SUD — Anao" seeds={sudSeeds} captures={captured.SUD} active={!winner && turn === "SUD"} />
            </div>

            {/* Niveau de l'IA */}
            <div className="carved-card p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.26em] text-[#8f7a55]">Force de l'IA</div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[rgba(0,0,0,0.28)] p-1">
                {([
                  ["facile", "Facile", "aléatoire"],
                  ["moyen", "Moyen", "prof. 2"],
                  ["difficile", "Difficile", "prof. 4"],
                ] as Array<[AiLevel, string, string]>).map(([id, label, sub]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLevel(id)}
                    aria-pressed={level === id}
                    className={`rounded-lg px-1 py-2 text-center transition-all duration-200 ${
                      level === id
                        ? "bg-[linear-gradient(180deg,#d9a441,#c08a2e)] text-[#241505] shadow-[0_4px_12px_rgba(217,164,65,0.3)]"
                        : "text-[#d8c39c] hover:bg-[rgba(240,221,186,0.08)]"
                    }`}
                  >
                    <div className="text-[13px] font-extrabold leading-tight">{label}</div>
                    <div className={`text-[10px] ${level === id ? "text-[#4a2f0d]" : "text-[#8f7a55]"}`}>{sub}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug text-[#8f7a55]">
                Minimax avec élagage alpha-bêta — le changement s'applique dès le prochain coup de l'IA.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button type="button" className="btn btn-primary" onClick={newGame}>
                <RefreshIcon /> Nouvelle partie
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRules(true)}>
                <BookIcon /> Règles du katro
              </button>
            </div>

            <p className="px-1 text-[11px] italic leading-relaxed text-[#8f7a55]">
              <span className="text-[#c9ab7d]">Vato</span> — graines · <span className="text-[#c9ab7d]">Lalana</span> — circuit de semis ·
              <span className="text-[#c9ab7d]"> Lavaka</span> — trou. 64 graines, un seul vainqueur.
            </p>
          </aside>
        </main>

        <footer className="mt-10 border-t border-[rgba(217,164,65,0.12)] pt-4 text-center text-[11px] tracking-wide text-[#8f7a55]">
          Katro, jeu de mancala des hauts plateaux de Madagascar — semé à la main, anti-horaire toujours.
        </footer>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
