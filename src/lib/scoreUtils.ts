const GAME_TARGET = 21;
const GAME_CAP = 30;
const GAMES_TO_WIN = 2;

export type PointSide = "left" | "right";

export const POINT_REASONS = [
  "winner",
  "opponent_unforced_error",
  "forced_error",
  "service_error",
  "lucky",
] as const;
export type PointReason = (typeof POINT_REASONS)[number];

export interface PointEntry {
  side: PointSide;
  reason: PointReason;
}

export function toSide(entry: PointEntry | PointSide): PointSide {
  return typeof entry === "string" ? entry : entry.side;
}

export function normalizeEntry(entry: unknown): PointEntry {
  if (typeof entry === "string") return { side: entry as PointSide, reason: "winner" };
  const e = entry as { side?: string; reason?: string };
  return { side: (e.side ?? "left") as PointSide, reason: (e.reason ?? "winner") as PointReason };
}

export interface GameScore {
  left: number;
  right: number;
}

export interface DerivedScore {
  games: GameScore[];
  currentGame: GameScore;
  gameIndex: number;
  matchOver: boolean;
  winnerSide: PointSide | null;
}

function gameWon(left: number, right: number): PointSide | null {
  if (left >= GAME_CAP || right >= GAME_CAP) return left >= GAME_CAP && left > right ? "left" : right >= GAME_CAP ? "right" : null;
  if (left >= GAME_TARGET && left >= right + 2) return "left";
  if (right >= GAME_TARGET && right >= left + 2) return "right";
  return null;
}

function ensurePointHistoryArray(value: unknown): (PointEntry | PointSide)[] {
  if (Array.isArray(value)) return value;
  return [];
}

export function deriveScore(pointHistory: (PointEntry | PointSide)[] | unknown): DerivedScore {
  const list = ensurePointHistoryArray(pointHistory);
  const games: GameScore[] = [];
  let current = { left: 0, right: 0 };
  let gameIndex = 0;
  let leftWins = 0;
  let rightWins = 0;

  for (const entry of list) {
    const side = toSide(entry);
    if (side === "left") current.left++;
    else current.right++;

    const won = gameWon(current.left, current.right);
    if (won) {
      games.push({ ...current });
      if (won === "left") leftWins++; else rightWins++;
      if (leftWins === GAMES_TO_WIN || rightWins === GAMES_TO_WIN) {
        return {
          games,
          currentGame: { left: 0, right: 0 },
          gameIndex: games.length,
          matchOver: true,
          winnerSide: leftWins === GAMES_TO_WIN ? "left" : "right",
        };
      }
      current = { left: 0, right: 0 };
      gameIndex = games.length;
    }
  }

  return {
    games,
    currentGame: current,
    gameIndex,
    matchOver: false,
    winnerSide: null,
  };
}

/** Validate a single game score (21 win by 2, cap 30). Returns error message or null if valid. */
export function validateGameScore(left: number, right: number): string | null {
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0) return "Scores must be whole numbers ≥ 0";
  if (left > GAME_CAP || right > GAME_CAP) return `Scores cannot exceed ${GAME_CAP}`;
  const won = gameWon(left, right);
  if (won) return null; // game over, valid
  if (left >= GAME_TARGET || right >= GAME_TARGET) return "Game must be won by 2 or reach 30";
  return null;
}

/** Return the prefix of pointHistory that covers only completed games (no partial current game). */
export function prefixCompletedGames(
  pointHistory: (PointEntry | PointSide)[] | unknown
): (PointEntry | PointSide)[] {
  const list = ensurePointHistoryArray(pointHistory);
  let left = 0;
  let right = 0;
  let cutIndex = 0;
  for (let i = 0; i < list.length; i++) {
    const side = toSide(list[i]);
    if (side === "left") left++;
    else right++;
    const won = gameWon(left, right);
    if (won) {
      cutIndex = i + 1;
      left = 0;
      right = 0;
    }
  }
  return list.slice(0, cutIndex);
}

/** Build step chart data for current game: [{ pointIndex, left, right }]. */
export function buildCurrentGameProgression(
  pointHistory: (PointEntry | PointSide)[] | unknown
): { pointIndex: number; left: number; right: number }[] {
  const list = ensurePointHistoryArray(pointHistory);
  let out: { pointIndex: number; left: number; right: number }[] = [{ pointIndex: 0, left: 0, right: 0 }];
  let left = 0;
  let right = 0;
  for (let i = 0; i < list.length; i++) {
    const side = toSide(list[i]);
    if (side === "left") left++;
    else right++;
    const won = gameWon(left, right);
    if (won) {
      left = 0;
      right = 0;
      out = [{ pointIndex: 0, left: 0, right: 0 }];
      continue;
    }
    out.push({ pointIndex: out.length, left, right });
  }
  return out;
}
