import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Cell = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";

const BOARD_SIZE = 20;
const CELL_SIZE = 20;
const BASE_SPEED = 240;
const MAX_LIVES = 3;
const INVINCIBLE_MS = 3000;
const MIN_SWIPE = 24;

const DIR_MAP: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function sameCell(a: Cell, b: Cell) {
  return a.x === b.x && a.y === b.y;
}

function randomInt(max: number) {
  return Math.floor(Math.random() * max);
}

function buildDefaultWorm(length = 3): Cell[] {
  return Array.from({ length }, (_, i) => ({ x: 10 - i, y: 10 }));
}

function isReverse(next: Direction, current: Direction) {
  return (
    (next === "up" && current === "down") ||
    (next === "down" && current === "up") ||
    (next === "left" && current === "right") ||
    (next === "right" && current === "left")
  );
}

function hearts(lives: number) {
  return Array.from({ length: MAX_LIVES }, (_, i) => i < lives);
}

export default function WormGameReact() {
  const [worm, setWorm] = useState<Cell[]>(() => buildDefaultWorm(3));
  const [direction, setDirection] = useState<Direction>("right");
  const [food, setFood] = useState<Cell>({ x: 14, y: 10 });
  const [obstacles, setObstacles] = useState<Cell[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem("worm-best-score-react") || 0);
  });
  const [lives, setLives] = useState(MAX_LIVES);
  const [foodsEaten, setFoodsEaten] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(true);
  const [message, setMessage] = useState("방향키, 버튼, 또는 스와이프로 시작하세요.");
  const [invincibleUntil, setInvincibleUntil] = useState(0);
  const [hitFlash, setHitFlash] = useState(false);
  const [hitCell, setHitCell] = useState<Cell | null>(null);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const directionRef = useRef<Direction>("right");
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const waitingRef = useRef(true);
  const wormRef = useRef<Cell[]>(buildDefaultWorm(3));
  const obstaclesRef = useRef<Cell[]>([]);
  const foodRef = useRef<Cell>({ x: 14, y: 10 });
  const livesRef = useRef(MAX_LIVES);
  const foodsEatenRef = useRef(0);
  const invincibleRef = useRef(0);

  const boardPx = BOARD_SIZE * CELL_SIZE;
  const isInvincible = Date.now() < invincibleUntil;

  const syncRefs = useCallback(() => {
    directionRef.current = direction;
    runningRef.current = running;
    pausedRef.current = paused;
    waitingRef.current = waitingForInput;
    wormRef.current = worm;
    obstaclesRef.current = obstacles;
    foodRef.current = food;
    livesRef.current = lives;
    foodsEatenRef.current = foodsEaten;
    invincibleRef.current = invincibleUntil;
  }, [direction, running, paused, waitingForInput, worm, obstacles, food, lives, foodsEaten, invincibleUntil]);

  useEffect(() => {
    syncRefs();
  }, [syncRefs]);

  const isBlocked = useCallback((cell: Cell, wormCells: Cell[], obstacleCells: Cell[]) => {
    return wormCells.some((part) => sameCell(part, cell)) || obstacleCells.some((part) => sameCell(part, cell));
  }, []);

  const randomFoodCell = useCallback((wormCells: Cell[], obstacleCells: Cell[]) => {
    for (let guard = 0; guard < 2000; guard += 1) {
      const cell = { x: randomInt(BOARD_SIZE), y: randomInt(BOARD_SIZE) };
      if (!isBlocked(cell, wormCells, obstacleCells)) return cell;
    }
    return { x: 0, y: 0 };
  }, [isBlocked]);

  const addObstacleCells = useCallback((wormCells: Cell[], obstacleCells: Cell[], foodCell: Cell, count = 5) => {
    const next = [...obstacleCells];
    let added = 0;
    for (let guard = 0; guard < 3000 && added < count; guard += 1) {
      const cell = { x: randomInt(BOARD_SIZE), y: randomInt(BOARD_SIZE) };
      const blocked = wormCells.some((p) => sameCell(p, cell)) || next.some((p) => sameCell(p, cell)) || sameCell(foodCell, cell);
      if (!blocked) {
        next.push(cell);
        added += 1;
      }
    }
    return next;
  }, []);

  const randomRespawn = useCallback((length: number, obstacleCells: Cell[]) => {
    const dirs: Direction[] = ["right", "left", "down", "up"];
    for (let guard = 0; guard < 3000; guard += 1) {
      const dir = dirs[randomInt(dirs.length)];
      const vec = DIR_MAP[dir];
      const start = { x: randomInt(BOARD_SIZE), y: randomInt(BOARD_SIZE) };
      const nextWorm: Cell[] = [];
      let valid = true;
      for (let i = 0; i < length; i += 1) {
        const cell = { x: start.x - vec.dx * i, y: start.y - vec.dy * i };
        if (
          cell.x < 0 ||
          cell.x >= BOARD_SIZE ||
          cell.y < 0 ||
          cell.y >= BOARD_SIZE ||
          obstacleCells.some((o) => sameCell(o, cell))
        ) {
          valid = false;
          break;
        }
        nextWorm.push(cell);
      }
      if (valid) {
        return { worm: nextWorm, direction: dir };
      }
    }
    return { worm: buildDefaultWorm(3), direction: "right" as Direction };
  }, []);

  const resetAll = useCallback(() => {
    const nextWorm = buildDefaultWorm(3);
    const nextObstacles: Cell[] = [];
    const nextFood = randomFoodCell(nextWorm, nextObstacles);
    setWorm(nextWorm);
    setDirection("right");
    setFood(nextFood);
    setObstacles(nextObstacles);
    setScore(0);
    setLives(MAX_LIVES);
    setFoodsEaten(0);
    setRunning(false);
    setPaused(false);
    setWaitingForInput(true);
    setInvincibleUntil(0);
    setHitCell(null);
    setMessage("방향키, 버튼, 또는 스와이프로 시작하세요.");
  }, [randomFoodCell]);

  useEffect(() => {
    resetAll();
  }, [resetAll]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("worm-best-score-react", String(bestScore));
    }
  }, [bestScore]);

  const startOrResume = useCallback(() => {
    setRunning(true);
    setPaused(false);
    setWaitingForInput(false);
  }, []);

  const handleDirection = useCallback((next: Direction) => {
    const current = directionRef.current;

    if (waitingRef.current) {
      setDirection(next);
      directionRef.current = next;
      startOrResume();
      return;
    }

    if (!runningRef.current || pausedRef.current) return;
    if (isReverse(next, current)) return;

    setDirection(next);
    directionRef.current = next;
  }, [startOrResume]);

  const applyHit = useCallback((collisionCell: Cell) => {
    setHitCell(collisionCell);
    setHitFlash(true);
    window.setTimeout(() => setHitFlash(false), 350);

    const remainingLives = livesRef.current - 1;

    if (remainingLives <= 0) {
      const finalScore = score;
      resetAll();
      setMessage(`게임 오버. 최종 점수 ${finalScore}. 방향키, 버튼, 또는 스와이프로 다시 시작하세요.`);
      return;
    }

    let nextObstacles = [...obstaclesRef.current];
    if (nextObstacles.length > 0) {
      const removeCount = Math.max(1, Math.floor(nextObstacles.length * 0.5));
      nextObstacles = [...nextObstacles].sort(() => Math.random() - 0.5).slice(removeCount);
    }

    const reducedLength = Math.max(3, Math.ceil(wormRef.current.length * 0.8));
    const respawn = randomRespawn(reducedLength, nextObstacles);
    const nextFood = randomFoodCell(respawn.worm, nextObstacles);
    const until = Date.now() + INVINCIBLE_MS;

    setLives(remainingLives);
    setObstacles(nextObstacles);
    setWorm(respawn.worm);
    setDirection(respawn.direction);
    setFood(nextFood);
    setInvincibleUntil(until);
    setRunning(false);
    setPaused(false);
    setWaitingForInput(true);
    setMessage(`목숨이 1개 줄었습니다. 남은 목숨: ${remainingLives}. 입력 후 다시 시작합니다. 무적 3초 적용.`);
  }, [randomFoodCell, randomRespawn, resetAll, score]);

  const tick = useCallback(() => {
    if (!runningRef.current || pausedRef.current || waitingRef.current) return;

    const currentWorm = wormRef.current;
    const currentDirection = directionRef.current;
    const currentFood = foodRef.current;
    const currentObstacles = obstaclesRef.current;
    const vec = DIR_MAP[currentDirection];
    const head = { x: currentWorm[0].x + vec.dx, y: currentWorm[0].y + vec.dy };
    const invincible = Date.now() < invincibleRef.current;

    const collided =
      head.x < 0 ||
      head.x >= BOARD_SIZE ||
      head.y < 0 ||
      head.y >= BOARD_SIZE ||
      currentWorm.some((part) => sameCell(part, head)) ||
      currentObstacles.some((part) => sameCell(part, head));

    if (collided) {
      if (!invincible) applyHit(head);
      return;
    }

    const nextWorm = [head, ...currentWorm];
    let nextFood = currentFood;
    let nextObstacles = currentObstacles;
    let nextScore = score;
    let nextFoodsEaten = foodsEatenRef.current;

    if (sameCell(head, currentFood)) {
      nextScore += 10;
      nextFoodsEaten += 1;
      if (nextScore > bestScore) {
        setBestScore(nextScore);
      }
      if (nextFoodsEaten % 5 === 0) {
        nextObstacles = addObstacleCells(nextWorm, currentObstacles, currentFood, 5);
      }
      nextFood = randomFoodCell(nextWorm, nextObstacles);
      setScore(nextScore);
      setFoodsEaten(nextFoodsEaten);
      setObstacles(nextObstacles);
      setFood(nextFood);
      setWorm(nextWorm);
    } else {
      nextWorm.pop();
      setWorm(nextWorm);
    }
  }, [addObstacleCells, applyHit, bestScore, score, randomFoodCell]);

  useEffect(() => {
    if (!running || paused || waitingForInput) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setTimeout(() => {
      tick();
    }, BASE_SPEED);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [worm, running, paused, waitingForInput, tick]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === "ArrowUp") handleDirection("up");
      if (e.key === "ArrowDown") handleDirection("down");
      if (e.key === "ArrowLeft") handleDirection("left");
      if (e.key === "ArrowRight") handleDirection("right");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDirection]);

  const boardCells = useMemo(() => {
    const items = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const cell = { x, y };
        let className = (x + y) % 2 === 0 ? "bg-lime-100" : "bg-lime-200";
        if (sameCell(food, cell)) className = "bg-red-500 rounded-md";
        if (obstacles.some((o) => sameCell(o, cell))) className = "bg-slate-500 rounded-md";
        const wormIndex = worm.findIndex((part) => sameCell(part, cell));
        if (wormIndex >= 0) {
          className = wormIndex === 0
            ? isInvincible ? "bg-sky-400 rounded-md" : "bg-green-700 rounded-md"
            : isInvincible ? "bg-sky-200 rounded-md" : "bg-green-500 rounded-md";
        }
        if (hitCell && sameCell(hitCell, cell)) {
          className += " ring-4 ring-red-300";
        }
        items.push(
          <div
            key={`${x}-${y}`}
            className={`${className} border border-white/20`}
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
          />
        );
      }
    }
    return items;
  }, [food, obstacles, worm, hitCell, isInvincible]);

  return (
    <div className="min-h-screen bg-lime-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-slate-800">지렁이 게임 React 버전</h1>
          <div className="flex flex-wrap gap-2 text-sm">
            <div className="rounded-full bg-lime-100 px-3 py-2">점수: <span className="font-semibold">{score}</span></div>
            <div className="rounded-full bg-lime-100 px-3 py-2">최고 점수: <span className="font-semibold">{bestScore}</span></div>
            <div className="rounded-full bg-lime-100 px-3 py-2 flex items-center gap-1">
              목숨:
              {hearts(lives).map((on, i) => (
                <span key={i} className={`text-base ${on ? "opacity-100" : "opacity-25"}`}>❤</span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className={`relative overflow-hidden rounded-2xl border-2 border-lime-300 bg-lime-100 ${hitFlash ? "animate-pulse" : ""}`}
            style={{ width: boardPx, maxWidth: "100%", aspectRatio: "1 / 1" }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              touchStartRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              if (!touchStartRef.current) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - touchStartRef.current.x;
              const dy = t.clientY - touchStartRef.current.y;
              touchStartRef.current = null;
              if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE) return;
              if (Math.abs(dx) > Math.abs(dy)) handleDirection(dx > 0 ? "right" : "left");
              else handleDirection(dy > 0 ? "down" : "up");
            }}
          >
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                width: "100%",
                height: "100%",
              }}
            >
              {boardCells}
            </div>

            {isInvincible && (
              <div className="pointer-events-none absolute inset-0 bg-sky-200/20" />
            )}

            {(waitingForInput || paused) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/55 p-4 text-center">
                <div className="rounded-2xl bg-white/95 shadow-lg px-5 py-4 text-slate-700 leading-6">
                  <div className="text-xl font-bold mb-2">{paused ? "일시정지" : "준비"}</div>
                  <div>{paused ? "계속하려면 일시정지를 다시 누르세요." : message}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={resetAll}
            className="rounded-xl bg-green-700 hover:bg-green-800 text-white px-4 py-2 font-medium"
          >
            새 게임
          </button>
          <button
            onClick={() => {
              if (waitingForInput) return;
              setPaused((prev) => !prev);
            }}
            className="rounded-xl bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 font-medium"
          >
            {paused ? "계속하기" : "일시정지"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 w-fit mx-auto select-none">
          <div />
          <button onClick={() => handleDirection("up")} className="h-16 w-16 rounded-2xl bg-lime-100 text-2xl font-bold text-green-800 shadow">▲</button>
          <div />
          <button onClick={() => handleDirection("left")} className="h-16 w-16 rounded-2xl bg-lime-100 text-2xl font-bold text-green-800 shadow">◀</button>
          <button onClick={() => handleDirection("down")} className="h-16 w-16 rounded-2xl bg-lime-100 text-2xl font-bold text-green-800 shadow">▼</button>
          <button onClick={() => handleDirection("right")} className="h-16 w-16 rounded-2xl bg-lime-100 text-2xl font-bold text-green-800 shadow">▶</button>
        </div>

        <div className="mt-5 text-sm leading-6 text-slate-600">
          <div>조작: 키보드 방향키 / 모바일 버튼 / 스와이프</div>
          <div>먹이 5개마다 장애물 5개 추가</div>
          <div>충돌 시 목숨 1 감소, 길이 20% 감소, 랜덤 위치 재시작, 장애물 일부 제거</div>
          <div>충돌 후 바로 움직이지 않고 입력 1번 후 재시작, 무적 시간 3초</div>
        </div>
      </div>
    </div>
  );
}
