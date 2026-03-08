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

export function deriveScore(pointHistory: (PointEntry | PointSide)[]): DerivedScore {
  const games: GameScore[] = [];
  let current = { left: 0, right: 0 };
  let gameIndex = 0;
  let leftWins = 0;
  let rightWins = 0;

  for (const entry of pointHistory) {
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
