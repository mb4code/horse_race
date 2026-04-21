const HORSE_COUNT = 25;
const HORSES = Array.from({ length: HORSE_COUNT }, (_, index) =>
  String.fromCharCode(65 + index)
);
const TOTAL_RELATIONS = (HORSE_COUNT * (HORSE_COUNT - 1)) / 2;

const LOWER_BOUND = Math.ceil(
  factorialLog(HORSE_COUNT) / Math.log(factorial(5))
);

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }
  return result;
}

function factorialLog(value) {
  let result = 0;
  for (let index = 2; index <= value; index += 1) {
    result += Math.log(index);
  }
  return result;
}

function shuffle(array, random = Math.random) {
  const clone = [...array];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function chooseUnique(values, count) {
  const result = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
    if (result.length === count) {
      break;
    }
  }
  return result;
}

function range(size) {
  return Array.from({ length: size }, (_, index) => index);
}

function cloneStatsCache(cache) {
  return {
    fast: cache.fast
      ? cache.fast.map((entry) => ({ ...entry, candidateRanks: [...entry.candidateRanks] }))
      : null,
    detailed: cache.detailed
      ? cache.detailed.map((entry) => ({ ...entry, candidateRanks: [...entry.candidateRanks] }))
      : null,
  };
}

function buildBaseStats(closure) {
  return HORSES.map((horse, index) => {
    let beats = 0;
    let lostTo = 0;
    for (let other = 0; other < HORSES.length; other += 1) {
      if (closure[index][other]) {
        beats += 1;
      }
      if (closure[other][index]) {
        lostTo += 1;
      }
    }

    const minRank = lostTo + 1;
    const maxRank = HORSE_COUNT - beats;
    const span = maxRank - minRank + 1;
    const certainty = Math.round((1 / span) * 100);

    return {
      horse,
      beats,
      lostTo,
      minRank,
      maxRank,
      span,
      certainty,
    };
  });
}

class RankingEngine {
  constructor(hiddenOrder = shuffle(HORSES)) {
    this.horses = [...HORSES];
    this.hiddenOrder = [...hiddenOrder];
    this.hiddenRank = Object.fromEntries(
      this.hiddenOrder.map((horse, index) => [horse, index + 1])
    );
    this.closure = this.createEmptyMatrix();
    this.raceHistory = [];
    this.strategyMessages = [];
    this._statsCache = {
      fast: null,
      detailed: null,
    };
  }

  createEmptyMatrix() {
    return HORSES.map(() => HORSES.map(() => false));
  }

  clone() {
    const clone = new RankingEngine(this.hiddenOrder);
    clone.closure = this.closure.map((row) => [...row]);
    clone.raceHistory = this.raceHistory.map((entry) => ({
      ...entry,
      participants: [...entry.participants],
      outcome: [...entry.outcome],
    }));
    clone.strategyMessages = [...this.strategyMessages];
    clone._statsCache = cloneStatsCache(this._statsCache);
    return clone;
  }

  resolveRace(participants) {
    return [...participants].sort(
      (left, right) => this.hiddenRank[left] - this.hiddenRank[right]
    );
  }

  applyRace(participants, label = "Manual", explanation = "") {
    const unique = chooseUnique(participants, 5);
    if (unique.length !== 5) {
      throw new Error("A race must contain exactly five unique horses.");
    }

    const outcome = this.resolveRace(unique);
    for (let i = 0; i < outcome.length; i += 1) {
      for (let j = i + 1; j < outcome.length; j += 1) {
        const faster = HORSES.indexOf(outcome[i]);
        const slower = HORSES.indexOf(outcome[j]);
        this.closure[faster][slower] = true;
      }
    }

    this.recomputeTransitiveClosure();

    this.raceHistory.push({
      number: this.raceHistory.length + 1,
      label,
      participants: unique,
      outcome,
      explanation,
    });

    if (explanation) {
      this.strategyMessages.push(
        `Race #${this.raceHistory.length}: ${label} chose ${unique.join(", ")}. ${explanation}`
      );
    }

    this._statsCache = {
      fast: null,
      detailed: null,
    };

    return outcome;
  }

  recomputeTransitiveClosure() {
    const size = HORSES.length;
    for (let via = 0; via < size; via += 1) {
      for (let from = 0; from < size; from += 1) {
        if (!this.closure[from][via]) {
          continue;
        }
        for (let to = 0; to < size; to += 1) {
          if (this.closure[via][to]) {
            this.closure[from][to] = true;
          }
        }
      }
    }
  }

  countKnownRelations() {
    let count = 0;
    for (let i = 0; i < HORSES.length; i += 1) {
      for (let j = i + 1; j < HORSES.length; j += 1) {
        if (this.closure[i][j] || this.closure[j][i]) {
          count += 1;
        }
      }
    }
    return count;
  }

  isSolved() {
    return this.countKnownRelations() === TOTAL_RELATIONS;
  }

  getStats(mode = "fast") {
    if (this._statsCache[mode]) {
      return this._statsCache[mode].map((entry) => ({
        ...entry,
        candidateRanks: [...entry.candidateRanks],
      }));
    }

    const baseStats = buildBaseStats(this.closure);

    const exactByRank = new Map(
      baseStats
        .filter((entry) => entry.span === 1)
        .map((entry) => [entry.minRank, entry.horse])
    );

    const allowedRanksByHorse = buildAllowedRanks(baseStats, exactByRank);
    const ranksByHorse =
      mode === "detailed"
        ? computeFeasibleRanks(allowedRanksByHorse)
        : allowedRanksByHorse;

    const stats = baseStats
      .map((entry) => ({
        ...entry,
        candidateRanks: ranksByHorse.get(entry.horse) ?? [],
      }))
      .sort((left, right) => {
        if (left.minRank !== right.minRank) {
          return left.minRank - right.minRank;
        }
        if (left.maxRank !== right.maxRank) {
          return left.maxRank - right.maxRank;
        }
        return left.horse.localeCompare(right.horse);
      });

    this._statsCache[mode] = stats.map((entry) => ({
      ...entry,
      candidateRanks: [...entry.candidateRanks],
    }));

    return stats.map((entry) => ({
      ...entry,
      candidateRanks: [...entry.candidateRanks],
    }));
  }

  getEstimatedOrder(mode = "fast") {
    return this.getStats(mode).sort((left, right) => {
      const leftMid = (left.minRank + left.maxRank) / 2;
      const rightMid = (right.minRank + right.maxRank) / 2;
      if (leftMid !== rightMid) {
        return leftMid - rightMid;
      }
      if (left.span !== right.span) {
        return left.span - right.span;
      }
      return left.horse.localeCompare(right.horse);
    });
  }

  getUncertainHorses(mode = "fast") {
    return this.getStats(mode)
      .filter((entry) => entry.span > 1)
      .sort((left, right) => right.span - left.span || left.minRank - right.minRank);
  }

  getHorseStat(horse, mode = "fast") {
    return this.getStats(mode).find((entry) => entry.horse === horse);
  }

  getIncomparablePairs(limit = 40) {
    const pairs = [];
    for (let i = 0; i < HORSES.length; i += 1) {
      for (let j = i + 1; j < HORSES.length; j += 1) {
        if (!this.closure[i][j] && !this.closure[j][i]) {
          const left = this.getHorseStat(HORSES[i]);
          const right = this.getHorseStat(HORSES[j]);
          const overlap =
            Math.min(left.maxRank, right.maxRank) -
            Math.max(left.minRank, right.minRank) +
            1;
          pairs.push({
            horses: [HORSES[i], HORSES[j]],
            overlap,
            distance: Math.abs(
              (left.minRank + left.maxRank) / 2 -
                (right.minRank + right.maxRank) / 2
            ),
          });
        }
      }
    }
    return pairs
      .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)
      .slice(0, limit);
  }

  getInsightLines() {
    const stats = this.getStats();
    const exact = stats.filter((entry) => entry.span === 1);
    const bottomLocked = stats.filter((entry) => entry.minRank >= 16);
    const topLocked = stats.filter((entry) => entry.maxRank <= 10);
    const widest = [...stats].sort((left, right) => right.span - left.span)[0];
    const pair = this.getIncomparablePairs(1)[0];
    const lines = [];

    if (exact.length > 0) {
      lines.push(
        `${exact.length} horses already have exact positions: ${exact
          .slice(0, 6)
          .map((entry) => `${entry.horse} (#${entry.minRank})`)
          .join(", ")}${exact.length > 6 ? ", ..." : ""}.`
      );
    }

    if (topLocked.length > 0) {
      lines.push(
        `${topLocked.length} horses are guaranteed to finish in the top 10: ${topLocked
          .slice(0, 6)
          .map((entry) => entry.horse)
          .join(", ")}${topLocked.length > 6 ? ", ..." : ""}.`
      );
    }

    if (bottomLocked.length > 0) {
      lines.push(
        `${bottomLocked.length} horses are trapped in the bottom 10: ${bottomLocked
          .slice(0, 6)
          .map((entry) => entry.horse)
          .join(", ")}${bottomLocked.length > 6 ? ", ..." : ""}.`
      );
    }

    if (widest) {
      lines.push(
        `Horse ${widest.horse} still spans ranks ${widest.minRank}-${widest.maxRank}, the widest uncertainty interval in the field.`
      );
    }

    if (pair) {
      lines.push(
        `A valuable unresolved comparison remains between ${pair.horses[0]} and ${pair.horses[1]}, whose rank intervals still overlap heavily.`
      );
    }

    if (lines.length === 0) {
      lines.push("Every horse is still completely unresolved. Start with any five-horse heat.");
    }

    return lines;
  }

  getRankBands() {
    const stats = this.getStats();
    const exact = stats.filter((entry) => entry.span === 1);
    const uncertain = stats.filter((entry) => entry.span > 1);
    const topContenders = uncertain
      .filter((entry) => entry.minRank <= 5)
      .slice(0, 6)
      .map((entry) => entry.horse);
    const middle = uncertain
      .filter((entry) => entry.minRank <= 15 && entry.maxRank >= 10)
      .slice(0, 8)
      .map((entry) => entry.horse);
    const bottomContenders = uncertain
      .filter((entry) => entry.maxRank >= 20)
      .slice(0, 8)
      .map((entry) => entry.horse);

    return [
      {
        title: "Exact Placements",
        description:
          exact.length > 0
            ? exact
                .slice(0, 8)
                .map((entry) => `#${entry.minRank}: ${entry.horse}`)
                .join(", ")
            : "No exact positions locked yet.",
      },
      {
        title: "Top-End Traffic",
        description:
          topContenders.length > 0
            ? `Still contesting the front: ${topContenders.join(", ")}`
            : "The top 5 is already fully determined.",
      },
      {
        title: "Middle Pack",
        description:
          middle.length > 0
            ? `Most overlap around ranks 10-15: ${middle.join(", ")}`
            : "The middle of the field is mostly settled.",
      },
      {
        title: "Bottom-End Traffic",
        description:
          bottomContenders.length > 0
            ? `Late-field uncertainty: ${bottomContenders.join(", ")}`
            : "The back of the field is already cleanly ordered.",
      },
    ];
  }
}

function buildAllowedRanks(baseStats, exactByRank) {
  const allowed = new Map();
  for (const entry of baseStats) {
    const ranks = [];
    for (let rank = entry.minRank; rank <= entry.maxRank; rank += 1) {
      const owner = exactByRank.get(rank);
      if (!owner || owner === entry.horse) {
        ranks.push(rank);
      }
    }
    allowed.set(entry.horse, ranks);
  }
  return allowed;
}

function computeFeasibleRanks(allowedRanksByHorse) {
  const feasible = new Map();
  for (const horse of HORSES) {
    const allowedRanks = allowedRanksByHorse.get(horse) ?? [];
    const ranks = [];
    for (const rank of allowedRanks) {
      if (hasPerfectMatchingWithAssignment(allowedRanksByHorse, horse, rank)) {
        ranks.push(rank);
      }
    }
    feasible.set(horse, ranks);
  }
  return feasible;
}

function hasRankSlotGap(candidateRanks) {
  if (!candidateRanks || candidateRanks.length <= 1) {
    return false;
  }

  for (let index = 1; index < candidateRanks.length; index += 1) {
    if (candidateRanks[index] !== candidateRanks[index - 1] + 1) {
      return true;
    }
  }

  return false;
}

function isNarrowedHorse(candidateRanks, threshold = 3) {
  return candidateRanks.length > 1 && candidateRanks.length <= threshold;
}

function hasPerfectMatchingWithAssignment(allowedRanksByHorse, fixedHorse, fixedRank) {
  const horses = HORSES.filter((horse) => horse !== fixedHorse);
  const rankToHorse = new Map([[fixedRank, fixedHorse]]);

  function tryAssign(horse, seenRanks) {
    const ranks = allowedRanksByHorse
      .get(horse)
      .filter((rank) => rank !== fixedRank);

    for (const rank of ranks) {
      if (seenRanks.has(rank)) {
        continue;
      }
      seenRanks.add(rank);
      const assignedHorse = rankToHorse.get(rank);
      if (!assignedHorse || tryAssign(assignedHorse, seenRanks)) {
        rankToHorse.set(rank, horse);
        return true;
      }
    }
    return false;
  }

  for (const horse of horses) {
    if (!tryAssign(horse, new Set())) {
      return false;
    }
  }

  return true;
}

function scoreCandidate(engine, horses) {
  const beforeStats = engine.getStats("fast");
  const beforeByHorse = new Map(beforeStats.map((entry) => [entry.horse, entry]));
  const selected = horses.map((horse) => beforeByHorse.get(horse));

  let unresolvedPairs = 0;
  let overlapPressure = 0;
  let slotPressure = 0;
  for (let i = 0; i < horses.length; i += 1) {
    for (let j = i + 1; j < horses.length; j += 1) {
      const leftHorse = horses[i];
      const rightHorse = horses[j];
      const leftIndex = HORSES.indexOf(leftHorse);
      const rightIndex = HORSES.indexOf(rightHorse);
      const unresolved =
        !engine.closure[leftIndex][rightIndex] && !engine.closure[rightIndex][leftIndex];
      if (unresolved) {
        unresolvedPairs += 1;
      }

      const left = beforeByHorse.get(leftHorse);
      const right = beforeByHorse.get(rightHorse);
      const overlap =
        Math.min(left.maxRank, right.maxRank) - Math.max(left.minRank, right.minRank) + 1;
      overlapPressure += Math.max(0, overlap);
    }
  }

  for (const entry of selected) {
    slotPressure += entry.candidateRanks.length;
  }

  const relationGain = unresolvedPairs;
  const spanGain = Math.max(
    1,
    Math.round(overlapPressure / 2 + slotPressure / Math.max(1, horses.length) - horses.length)
  );
  const score = relationGain * 8 + spanGain;

  const affected = selected
    .map((entry) => ({
      horse: entry.horse,
      slotReduction: Math.max(
        1,
        Math.round(Math.max(0, entry.candidateRanks.length - 1) / 2)
      ),
    }))
    .sort((left, right) => right.slotReduction - left.slotReduction)
    .slice(0, 4);

  const impactedRange = {
    min: Math.min(...selected.map((entry) => entry.minRank)),
    max: Math.max(...selected.map((entry) => entry.maxRank)),
  };
  const estimatedOrder = [...selected]
    .sort((left, right) => {
      const leftMid = (left.minRank + left.maxRank) / 2;
      const rightMid = (right.minRank + right.maxRank) / 2;
      if (leftMid !== rightMid) {
        return leftMid - rightMid;
      }
      return left.horse.localeCompare(right.horse);
    })
    .map((entry) => entry.horse);

  return {
    horses,
    relationGain,
    spanGain,
    score,
    affected,
    impactedRange,
    estimatedOrder,
  };
}

function candidateRaces(engine) {
  const stats = engine.getEstimatedOrder("fast");
  const uncertain = engine.getUncertainHorses("fast");
  const pairs = engine.getIncomparablePairs(18);
  const candidates = [];

  for (let index = 0; index <= stats.length - 5; index += 1) {
    candidates.push(stats.slice(index, index + 5).map((entry) => entry.horse));
  }

  for (let index = 0; index <= uncertain.length - 5; index += 1) {
    candidates.push(uncertain.slice(index, index + 5).map((entry) => entry.horse));
  }

  for (const pair of pairs) {
    const left = engine.getHorseStat(pair.horses[0], "fast");
    const right = engine.getHorseStat(pair.horses[1], "fast");
    const related = stats
      .filter((entry) => {
        const overlapLeft =
          Math.min(entry.maxRank, left.maxRank) - Math.max(entry.minRank, left.minRank) + 1;
        const overlapRight =
          Math.min(entry.maxRank, right.maxRank) - Math.max(entry.minRank, right.minRank) + 1;
        return overlapLeft > 0 || overlapRight > 0;
      })
      .map((entry) => entry.horse);

    candidates.push(chooseUnique([...pair.horses, ...related], 5));
  }

  const bandTargets = [3, 8, 13, 18, 23];
  candidates.push(
    chooseUnique(
      bandTargets
        .map((target) =>
          stats.find((entry) => entry.minRank <= target && entry.maxRank >= target)
        )
        .filter(Boolean)
        .map((entry) => entry.horse),
      5
    )
  );

  return candidates
    .filter((candidate) => candidate.length === 5)
    .map((candidate) => [...candidate].sort())
    .filter((candidate, index, array) => {
      const signature = candidate.join("|");
      return array.findIndex((value) => value.join("|") === signature) === index;
    });
}

function greedyPick(engine, label) {
  const scored = candidateRaces(engine)
    .map((candidate) => scoreCandidate(engine, candidate))
    .sort((left, right) => right.score - left.score || right.relationGain - left.relationGain);

  const best = scored[0];
  return {
    horses: best.horses,
    explanation:
      `${label}: this heat is expected to resolve ${best.relationGain} new pairwise relations and shrink total uncertainty by ${best.spanGain}.`,
    preview: best,
  };
}

const STRATEGIES = {
  merge(engine) {
    const groups = range(5).map((groupIndex) =>
      HORSES.slice(groupIndex * 5, groupIndex * 5 + 5)
    );

    if (engine.raceHistory.length < 5) {
      return {
        horses: groups[engine.raceHistory.length],
        explanation:
          "Seed the field with five internal group races so each cluster of five gets locally ordered.",
      };
    }

    if (engine.raceHistory.length >= 10) {
      return greedyPick(engine, "Merge cleanup");
    }

    const estimated = engine.getEstimatedOrder();
    const unresolvedBoundary = range(estimated.length - 4)
      .map((start) => estimated.slice(start, start + 5))
      .filter((window) => window.some((entry) => entry.span > 1))
      .map((window) => ({
        window,
        spread:
          Math.max(...window.map((entry) => entry.maxRank)) -
          Math.min(...window.map((entry) => entry.minRank)),
      }))
      .sort((left, right) => left.spread - right.spread)[0];

    if (unresolvedBoundary) {
      return {
        horses: unresolvedBoundary.window.map((entry) => entry.horse),
        explanation:
          "This merge-style step races neighboring horses whose rank bands overlap, tightening one frontier of the estimated sorted order.",
      };
    }

    return greedyPick(engine, "Fallback merge cleanup");
  },

  tournament(engine) {
    const groups = range(5).map((groupIndex) =>
      HORSES.slice(groupIndex * 5, groupIndex * 5 + 5)
    );

    if (engine.raceHistory.length < 5) {
      return {
        horses: groups[engine.raceHistory.length],
        explanation:
          "Start by building five local ladders, one for each opening heat.",
      };
    }

    if (engine.raceHistory.length >= 10) {
      return greedyPick(engine, "Tournament cleanup");
    }

    const estimated = engine.getEstimatedOrder();
    const bandStarts = [1, 6, 11, 16, 21];
    const bandPicks = chooseUnique(
      bandStarts
        .map((start) =>
          estimated.find((entry) => entry.minRank <= start + 2 && entry.maxRank >= start)
        )
        .filter(Boolean)
        .map((entry) => entry.horse),
      5
    );

    if (bandPicks.length === 5) {
      return {
        horses: bandPicks,
        explanation:
          "The tournament-tree strategy samples one active contender from each rank band to compare leaders from different parts of the field.",
      };
    }

    return greedyPick(engine, "Fallback tournament cleanup");
  },

  greedy(engine) {
    return greedyPick(engine, "One-step information gain search");
  },
};

const STRATEGY_DETAILS = {
  merge: {
    badge: "Merge-Inspired",
    description:
      "Starts with five local heats, then compares neighboring contenders whose rank bands overlap. It behaves like a constrained merge process that tightens one boundary at a time.",
    tips: [
      "Best for building structure early",
      "Leans on neighboring rank bands",
      "Usually steadier than fastest",
    ],
  },
  tournament: {
    badge: "Tournament Tree",
    description:
      "Builds local ladders first, then samples contenders from different rank bands to compare leaders across the field. It tries to spread information across the whole ordering.",
    tips: [
      "Cross-band comparisons",
      "Useful for broad coverage",
      "Can need cleanup later",
    ],
  },
  greedy: {
    badge: "Greedy Info Gain",
    description:
      "Scores candidate races by how many new comparisons and uncertainty reductions they are expected to create, then always chooses the best next heat available.",
    tips: [
      "Locally strongest next move",
      "Usually closest to the lower bound",
      "Good recommendation baseline",
    ],
  },
};

function runAutoStep(engine, strategyName) {
  const strategy = STRATEGIES[strategyName];
  const decision = strategy(engine);
  const outcome = engine.applyRace(
    decision.horses,
    strategyLabel(strategyName),
    decision.explanation
  );
  return { ...decision, outcome };
}

function runAutoSolve(hiddenOrder, strategyName, maxRaces = 60) {
  const engine = new RankingEngine(hiddenOrder);
  while (!engine.isSolved() && engine.raceHistory.length < maxRaces) {
    runAutoStep(engine, strategyName);
  }
  return engine;
}

function strategyLabel(strategyName) {
  if (strategyName === "merge") {
    return "Merge-Inspired";
  }
  if (strategyName === "tournament") {
    return "Tournament Tree";
  }
  return "Greedy Info Gain";
}

const state = {
  engine: new RankingEngine(),
  selection: [],
  recommendation: null,
  recommendationFocus: [],
  activeKnowledgeTab: "ladder",
};

const elements = {
  lowerBoundValue: document.querySelector("#lowerBoundValue"),
  raceCountValue: document.querySelector("#raceCountValue"),
  solvedValue: document.querySelector("#solvedValue"),
  knownRelationsValue: document.querySelector("#knownRelationsValue"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  modeSelect: document.querySelector("#modeSelect"),
  strategySelect: document.querySelector("#strategySelect"),
  autoStepButton: document.querySelector("#autoStepButton"),
  autoSolveButton: document.querySelector("#autoSolveButton"),
  compareAllButton: document.querySelector("#compareAllButton"),
  resetButton: document.querySelector("#resetButton"),
  revealButton: document.querySelector("#revealButton"),
  strategyBadge: document.querySelector("#strategyBadge"),
  strategyDescription: document.querySelector("#strategyDescription"),
  strategyTips: document.querySelector("#strategyTips"),
  selectedRace: document.querySelector("#selectedRace"),
  useRecommendationButton: document.querySelector("#useRecommendationButton"),
  addUncertainButton: document.querySelector("#addUncertainButton"),
  addBandButton: document.querySelector("#addBandButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  runManualRaceButton: document.querySelector("#runManualRaceButton"),
  recommendationBadge: document.querySelector("#recommendationBadge"),
  recommendationText: document.querySelector("#recommendationText"),
  recommendationWhy: document.querySelector("#recommendationWhy"),
  horsePool: document.querySelector("#horsePool"),
  rankSummary: document.querySelector("#rankSummary"),
  rankBands: document.querySelector("#rankBands"),
  insightPanel: document.querySelector("#insightPanel"),
  knowledgeTableBody: document.querySelector("#knowledgeTableBody"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
  strategyLog: document.querySelector("#strategyLog"),
  knowledgeTabLadder: document.querySelector("#knowledgeTabLadder"),
  knowledgeTabInsights: document.querySelector("#knowledgeTabInsights"),
  knowledgeTabTable: document.querySelector("#knowledgeTabTable"),
  knowledgePanelLadder: document.querySelector("#knowledgePanelLadder"),
  knowledgePanelInsights: document.querySelector("#knowledgePanelInsights"),
  knowledgePanelTable: document.querySelector("#knowledgePanelTable"),
  why13Button: document.querySelector("#why13Button"),
  comparisonTable: document.querySelector("#comparisonTable"),
  benchmarkTable: document.querySelector("#benchmarkTable"),
  comparisonModal: document.querySelector("#comparisonModal"),
  comparisonBackdrop: document.querySelector("#comparisonBackdrop"),
  closeComparisonModalButton: document.querySelector("#closeComparisonModalButton"),
  why13Modal: document.querySelector("#why13Modal"),
  why13Backdrop: document.querySelector("#why13Backdrop"),
  closeWhy13ModalButton: document.querySelector("#closeWhy13ModalButton"),
};

function resetPuzzle() {
  state.engine = new RankingEngine();
  state.selection = [];
  state.recommendation = null;
  state.recommendationFocus = [];
  state.activeKnowledgeTab = "ladder";
  refreshRecommendation();
  syncModeControls();
  render();
}

function syncModeControls() {
  const auto = elements.modeSelect.value === "auto";
  elements.autoStepButton.disabled = !auto;
  elements.autoSolveButton.disabled = !auto;
  elements.strategySelect.disabled = !auto;
}

function render() {
  const engine = state.engine;
  const known = engine.countKnownRelations();
  const progress = Math.round((known / TOTAL_RELATIONS) * 100);
  const detailedStats = engine.getStats("detailed");
  const exactCount = detailedStats.filter((entry) => entry.span === 1).length;
  const uncertainCount = HORSE_COUNT - exactCount;

  elements.lowerBoundValue.textContent = `${LOWER_BOUND} races`;
  elements.raceCountValue.textContent = String(engine.raceHistory.length);
  elements.solvedValue.textContent = `${progress}%`;
  elements.knownRelationsValue.textContent = `${known} / ${TOTAL_RELATIONS}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = engine.isSolved()
    ? `Full ordering established in ${engine.raceHistory.length} races.`
    : `${exactCount} horses are exact, ${uncertainCount} still have uncertain positions.`;

  renderSelection();
  renderStrategyGuide();
  renderHorsePool();
  renderBands();
  renderInsights();
  renderKnowledgeTable();
  renderKnowledgeTabs();
  renderHistoryView();
  renderStrategyLog();
}

function renderStrategyGuide() {
  const detail = STRATEGY_DETAILS[elements.strategySelect.value];
  elements.strategyBadge.textContent = detail.badge;
  elements.strategyDescription.textContent = detail.description;
  elements.strategyTips.innerHTML = detail.tips
    .map((tip) => `<span class="tip-pill" title="${tip}">${tip}</span>`)
    .join("");
}

function renderSelection() {
  if (state.selection.length === 0) {
    elements.selectedRace.className = "selection-pills empty";
    elements.selectedRace.textContent = "Choose five horses to race.";
    return;
  }

  elements.selectedRace.className = "selection-pills";
  elements.selectedRace.innerHTML = state.selection
    .map((horse) => `<span class="pill">${horse}</span>`)
    .join("");
}

function renderHorsePool() {
  const stats = state.engine.getStats("fast");
  elements.horsePool.innerHTML = stats
    .map((entry) => {
      const certaintyClass =
        entry.span === 1 ? "certain" : entry.span <= 5 ? "narrow" : "unknown";
      const isSelected = state.selection.includes(entry.horse) ? "selected" : "";
      const isRecommended = state.recommendationFocus.includes(entry.horse) ? "recommended" : "";
      return `
        <button class="horse-btn ${certaintyClass} ${isSelected} ${isRecommended}" data-horse="${entry.horse}">
          <strong>${entry.horse}</strong>
          <small>${entry.minRank}-${entry.maxRank}</small>
        </button>
      `;
    })
    .join("");

  elements.horsePool.querySelectorAll("[data-horse]").forEach((button) => {
    button.addEventListener("click", () => toggleHorse(button.dataset.horse));
  });
}

function renderBands() {
  const stats = state.engine.getStats("detailed");
  const exactCount = stats.filter((entry) => entry.candidateRanks.length === 1).length;
  const narrowedCount = stats.filter((entry) =>
    isNarrowedHorse(entry.candidateRanks)
  ).length;
  elements.rankSummary.textContent = `${exactCount} exact, ${narrowedCount} narrowed`;

  const headerCells = Array.from({ length: HORSE_COUNT }, (_, index) => {
    const rank = index + 1;
    return `<span class="ladder-rank-cell">${rank}</span>`;
  }).join("");

  const rows = stats
    .map((entry) => {
      const cells = Array.from({ length: HORSE_COUNT }, (_, index) => {
        const rank = index + 1;
        const isCandidate = entry.candidateRanks.includes(rank);
        const isExact = entry.candidateRanks.length === 1 && entry.candidateRanks[0] === rank;
        const classes = [
          "ladder-slot",
          isCandidate ? "candidate" : "blocked",
          isExact ? "exact" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const label = isExact
          ? `${entry.horse} fixed at rank ${rank}`
          : isCandidate
            ? `${entry.horse} can still finish rank ${rank}`
            : `${entry.horse} cannot finish rank ${rank}`;
        return `<span class="${classes}" title="${label}"></span>`;
      }).join("");

      return `
        <div class="ladder-row ${state.recommendationFocus.includes(entry.horse) ? "recommended" : ""}">
          <div class="ladder-horse-meta">
            <strong>${entry.horse}</strong>
            <span>${entry.minRank}-${entry.maxRank}</span>
          </div>
          <div class="ladder-slots" role="img" aria-label="${entry.horse} candidate ranks ${entry.candidateRanks.join(", ")}">
            ${cells}
          </div>
        </div>
      `;
    })
    .join("");

  elements.rankBands.innerHTML = `
    <div class="ladder-header">
      <div class="ladder-horse-meta subtle">Horse</div>
      <div class="ladder-slots ladder-axis">${headerCells}</div>
    </div>
    ${rows}
  `;
}

function renderInsights() {
  elements.insightPanel.innerHTML = state.engine
    .getInsightLines()
    .map(
      (line) => `
        <div class="insight-card">
          <strong>Insight</strong>
          <div>${line}</div>
        </div>
      `
    )
    .join("");
}

function renderKnowledgeTable() {
  const raceCounts = Object.fromEntries(HORSES.map((horse) => [horse, 0]));
  for (const race of state.engine.raceHistory) {
    for (const horse of race.participants) {
      raceCounts[horse] += 1;
    }
  }

  elements.knowledgeTableBody.innerHTML = state.engine
    .getStats("detailed")
    .map(
      (entry) => `
        <tr>
          <td><strong>${entry.horse}</strong></td>
          <td>${raceCounts[entry.horse]}</td>
          <td>${entry.minRank}</td>
          <td>${entry.maxRank}</td>
          <td>
            <div>${entry.certainty}%</div>
            <div class="certainty-bar"><span style="width:${entry.certainty}%"></span></div>
          </td>
          <td>${entry.beats}</td>
          <td>${entry.lostTo}</td>
        </tr>
      `
    )
    .join("");
}

function renderKnowledgeTabs() {
  const tabs = [
    {
      key: "ladder",
      button: elements.knowledgeTabLadder,
      panel: elements.knowledgePanelLadder,
    },
    {
      key: "insights",
      button: elements.knowledgeTabInsights,
      panel: elements.knowledgePanelInsights,
    },
    {
      key: "table",
      button: elements.knowledgeTabTable,
      panel: elements.knowledgePanelTable,
    },
  ];

  tabs.forEach(({ key, button, panel }) => {
    const active = state.activeKnowledgeTab === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function setKnowledgeTab(tabKey) {
  state.activeKnowledgeTab = tabKey;
  renderKnowledgeTabs();
}

function renderHistory() {
  const history = [...state.engine.raceHistory].reverse();
  elements.historyCount.textContent = `${state.engine.raceHistory.length} heats`;
  if (history.length === 0) {
    elements.historyList.className = "history-list empty-state";
    elements.historyList.textContent = "No races yet.";
    return;
  }

  elements.historyList.className = "history-list";
  elements.historyList.innerHTML = history
    .map(
      (entry) => `
        <div class="history-card">
          <strong>#${entry.number} · ${entry.label}</strong>
          <div class="mono">${entry.participants.join(", ")} -> ${entry.outcome.join(", ")}</div>
          <div>${entry.explanation || "Manual race."}</div>
        </div>
      `
    )
    .join("");
}

function renderHistoryView() {
  const history = [...state.engine.raceHistory].reverse();
  elements.historyCount.textContent = `${state.engine.raceHistory.length} heats`;
  if (history.length === 0) {
    elements.historyList.className = "history-list empty-state";
    elements.historyList.textContent = "No races yet.";
    return;
  }

  elements.historyList.className = "history-list";
  elements.historyList.innerHTML = history
    .map(
      (entry) => `
        <div class="history-card">
          <strong>#${entry.number} - ${entry.label}</strong>
          <div class="mono">${entry.participants.join(", ")} -> ${entry.outcome.join(", ")}</div>
          <div>${entry.explanation || "Manual race."}</div>
        </div>
      `
    )
    .join("");
}

function renderStrategyLog() {
  const logs = [...state.engine.strategyMessages].reverse();
  if (logs.length === 0) {
    elements.strategyLog.className = "strategy-log empty-state";
    elements.strategyLog.textContent = "Waiting for a strategy run.";
    return;
  }

  elements.strategyLog.className = "strategy-log";
  elements.strategyLog.innerHTML = logs
    .map(
      (log) => `
        <div class="log-card">${log}</div>
      `
    )
    .join("");
}

function refreshRecommendation() {
  if (state.engine.isSolved()) {
    state.recommendation = null;
    state.recommendationFocus = [];
    elements.recommendationBadge.className = "recommendation-score strong";
    elements.recommendationBadge.textContent = "Solved";
    elements.recommendationText.textContent =
      "The ranking is already complete. No further races are needed.";
    elements.recommendationWhy.textContent = "";
    return;
  }

  const recommendation = greedyPick(state.engine, "Recommendation search");
  state.recommendation = recommendation;
  state.recommendationFocus = [...recommendation.horses];
  const confidenceClass =
    recommendation.preview.relationGain >= 12 ? "strong" : "medium";
  elements.recommendationBadge.className = `recommendation-score ${confidenceClass}`;
  elements.recommendationBadge.textContent = `+${recommendation.preview.relationGain} relations`;
  elements.recommendationText.textContent = `Recommended next race: [${recommendation.horses.join(", ")}]`;
  const affectedText =
    recommendation.preview.affected.length > 0
      ? `Most likely to tighten: ${recommendation.preview.affected
          .map((entry) => `${entry.horse} (-${entry.slotReduction} slots)`)
          .join(", ")}.`
      : "This race mostly clarifies ordering between already-tight contenders.";
  elements.recommendationWhy.textContent =
    `${recommendation.explanation} Focus band: ranks ${recommendation.preview.impactedRange.min}-${recommendation.preview.impactedRange.max}. ${affectedText} Current best inferred order inside this heat: ${recommendation.preview.estimatedOrder.join(" > ")}.`;
}

function toggleHorse(horse) {
  if (state.selection.includes(horse)) {
    state.selection = state.selection.filter((entry) => entry !== horse);
  } else if (state.selection.length < 5) {
    state.selection = [...state.selection, horse];
  }
  renderSelection();
  renderHorsePool();
}

function addMostUncertain() {
  state.selection = state.engine
    .getUncertainHorses("fast")
    .slice(0, 5)
    .map((entry) => entry.horse);
  renderSelection();
  renderHorsePool();
}

function addRankGap() {
  const candidates = chooseUnique(
    state.engine
      .getEstimatedOrder("fast")
      .filter((entry) => entry.minRank <= 15 && entry.maxRank >= 10)
      .map((entry) => entry.horse),
    5
  );

  state.selection =
    candidates.length === 5
      ? candidates
      : state.engine.getEstimatedOrder("fast").slice(10, 15).map((entry) => entry.horse);
  renderSelection();
  renderHorsePool();
}

function runManualRace() {
  if (state.selection.length !== 5) {
    window.alert("Select exactly five horses before racing.");
    return;
  }

  const score = scoreCandidate(state.engine, state.selection);
  state.engine.applyRace(
    state.selection,
    "Manual",
    `Manual heat. This race revealed ${score.relationGain} new pairwise relations and shrank uncertainty by ${score.spanGain}.`
  );
  state.selection = [];
  refreshRecommendation();
  render();
}

function runSelectedStrategyStep() {
  runAutoStep(state.engine, elements.strategySelect.value);
  refreshRecommendation();
  render();
}

function runSelectedStrategySolve() {
  while (!state.engine.isSolved() && state.engine.raceHistory.length < 60) {
    runAutoStep(state.engine, elements.strategySelect.value);
  }
  refreshRecommendation();
  render();
}

function renderComparison(hiddenOrder) {
  const strategies = ["merge", "tournament", "greedy"];
  const results = strategies.map((name) => ({
    name,
    engine: runAutoSolve(hiddenOrder, name),
  }));

  elements.comparisonTable.className = "comparison-table";
  elements.comparisonTable.innerHTML = results
    .map(({ name, engine }) => {
      const solved = engine.isSolved();
      const summary = solved
        ? `Complete in ${engine.raceHistory.length} races.`
        : `Stopped at ${engine.raceHistory.length} races without full order.`;
      const logPreview = engine.strategyMessages.slice(0, 2).join(" ");
      const detail = STRATEGY_DETAILS[name];
      return `
        <div class="compare-card">
          <strong>${strategyLabel(name)}</strong>
          <div class="muted">${detail.description}</div>
          <div>${summary}</div>
          <div>${logPreview || "No strategy log generated."}</div>
        </div>
      `;
    })
    .join("");

  const benchmarkTrials = 6;
  const benchmark = strategies.map((name) => {
    const raceCounts = [];
    let hitLowerBound = 0;
    for (let trial = 0; trial < benchmarkTrials; trial += 1) {
      const engine = runAutoSolve(shuffle(HORSES), name);
      raceCounts.push(engine.raceHistory.length);
      if (engine.raceHistory.length === LOWER_BOUND) {
        hitLowerBound += 1;
      }
    }
    const average = (
      raceCounts.reduce((sum, value) => sum + value, 0) / benchmarkTrials
    ).toFixed(1);
    return {
      name,
      average,
      best: Math.min(...raceCounts),
      worst: Math.max(...raceCounts),
      hitLowerBound,
    };
  });

  elements.benchmarkTable.innerHTML = `
    <div class="compare-card">
      <strong>Benchmark Across ${benchmarkTrials} Random Hidden Orders</strong>
      <div class="muted">Average, best, worst, and how often a strategy hits the 13-race lower bound on sampled instances.</div>
    </div>
    ${benchmark
      .map(
        (entry) => `
          <div class="compare-card">
            <strong>${strategyLabel(entry.name)}</strong>
            <div>Average: ${entry.average} races</div>
            <div>Best / Worst: ${entry.best} / ${entry.worst}</div>
            <div>Hits 13 races: ${entry.hitLowerBound} / ${benchmarkTrials}</div>
          </div>
        `
      )
      .join("")}
  `;

  openComparisonModal();
}

function openComparisonModal() {
  elements.comparisonModal.classList.remove("hidden");
  elements.comparisonModal.setAttribute("aria-hidden", "false");
}

function closeComparisonModal() {
  elements.comparisonModal.classList.add("hidden");
  elements.comparisonModal.setAttribute("aria-hidden", "true");
}

function openWhy13Modal() {
  elements.why13Modal.classList.remove("hidden");
  elements.why13Modal.setAttribute("aria-hidden", "false");
}

function closeWhy13Modal() {
  elements.why13Modal.classList.add("hidden");
  elements.why13Modal.setAttribute("aria-hidden", "true");
}

elements.autoStepButton.addEventListener("click", runSelectedStrategyStep);
elements.autoSolveButton.addEventListener("click", runSelectedStrategySolve);
elements.compareAllButton.addEventListener("click", () =>
  renderComparison(state.engine.hiddenOrder)
);
elements.resetButton.addEventListener("click", resetPuzzle);
elements.revealButton.addEventListener("click", () => {
  const order = state.engine.hiddenOrder
    .map((horse, index) => `#${index + 1} ${horse}`)
    .join(", ");
  window.alert(`Horse ranking:\n${order}`);
});
elements.clearSelectionButton.addEventListener("click", () => {
  state.selection = [];
  renderSelection();
  renderHorsePool();
});
elements.runManualRaceButton.addEventListener("click", runManualRace);
elements.useRecommendationButton.addEventListener("click", () => {
  if (!state.recommendation) {
    return;
  }
  state.selection = [...state.recommendation.horses];
  renderSelection();
  renderHorsePool();
});
elements.addUncertainButton.addEventListener("click", addMostUncertain);
elements.addBandButton.addEventListener("click", addRankGap);
elements.modeSelect.addEventListener("change", syncModeControls);
elements.strategySelect.addEventListener("change", renderStrategyGuide);
elements.knowledgeTabLadder.addEventListener("click", () => setKnowledgeTab("ladder"));
elements.knowledgeTabInsights.addEventListener("click", () => setKnowledgeTab("insights"));
elements.knowledgeTabTable.addEventListener("click", () => setKnowledgeTab("table"));
elements.why13Button.addEventListener("click", openWhy13Modal);
elements.comparisonBackdrop.addEventListener("click", closeComparisonModal);
elements.closeComparisonModalButton.addEventListener("click", closeComparisonModal);
elements.why13Backdrop.addEventListener("click", closeWhy13Modal);
elements.closeWhy13ModalButton.addEventListener("click", closeWhy13Modal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.comparisonModal.classList.contains("hidden")) {
    closeComparisonModal();
  }
  if (event.key === "Escape" && !elements.why13Modal.classList.contains("hidden")) {
    closeWhy13Modal();
  }
});

resetPuzzle();
