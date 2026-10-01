/**
 * Goal System for Minecraft AI Bot
 * Supports extended goal types, equipment workflow pipeline, and survival recovery goals.
 */

export const GOAL_TYPES = {
  // Survival & Recovery Goals
  FARMING: 'farming',             // 農作業
  COOKING: 'cooking',             // 調理
  INVENTORY_SORTING: 'inventory_sorting', // 荷物整理

  // Core Progression & Workflow Goals
  MINING: 'mining',               // 採掘
  CRAFTING: 'crafting',           // クラフト
  EQUIPMENT: 'equipment',         // 装備

  // Exploration & Survey Goals
  PATROL: 'patrol',               // パトロール
  SURVIVAL: 'survival',           // 生存
  TERRAIN_SURVEY: 'terrain_survey', // 地形把握
  VILLAGE_ANALYSIS: 'village_analysis', // 街の分析
  NETHER_EXPLORATION: 'nether_exploration', // ネザー探検
  END_EXPLORATION: 'end_exploration', // エンド
  ANCIENT_CITY: 'ancient_city',   // 古代都市
  SNOWY_MOUNTAIN: 'snowy_mountain', // 雪山
  WOOD_CUTTING: 'wood_cutting',   // ポプラ/木材伐採
  CHEST_SORTING: 'chest_sorting'   // 倉庫整理
};

export const GOAL_DESCRIPTIONS = {
  [GOAL_TYPES.FARMING]: '農作物（小麦・ニンジン等）の収穫と種植えを行う農作業',
  [GOAL_TYPES.COOKING]: 'かまどやクラフトで食料を調理・作成する',
  [GOAL_TYPES.INVENTORY_SORTING]: '手持ちインベントリを整理・整頓する',

  [GOAL_TYPES.MINING]: '鉱石や有用資源を掘削する採掘',
  [GOAL_TYPES.CRAFTING]: 'ツールや防具、アイテムをクラフトする',
  [GOAL_TYPES.EQUIPMENT]: '装備を点検し、最強の武具を装着する',

  [GOAL_TYPES.PATROL]: '拠点周辺の安全を巡回・警戒パトロール',
  [GOAL_TYPES.SURVIVAL]: '周囲の危険を回避し、身を守る生存行動',
  [GOAL_TYPES.TERRAIN_SURVEY]: '高所や周りの地形・環境を把握・記録する',
  [GOAL_TYPES.VILLAGE_ANALYSIS]: '村人や建物の配置、職業ブロックを分析・計測する',
  [GOAL_TYPES.NETHER_EXPLORATION]: 'ネザーの要塞や危険・資源を警戒探検',
  [GOAL_TYPES.END_EXPLORATION]: 'エンドポータルや要塞、ドラゴン戦の準備・索敵',
  [GOAL_TYPES.ANCIENT_CITY]: '古代都市・ディープダークでスカルクや宝箱を慎重に調査',
  [GOAL_TYPES.SNOWY_MOUNTAIN]: '雪山・粉雪地帯の環境調査と山頂探検',
  [GOAL_TYPES.WOOD_CUTTING]: 'ポプラやオークなどの木材を大量伐採・収集',
  [GOAL_TYPES.CHEST_SORTING]: 'チェストへ手持ちアイテムを分類・倉庫整理'
};

/**
 * 装備強化ワークフロー（一連の流れ）
 * 1. 採掘 (mining) -> 2. クラフト (crafting) -> 3. 装備 (equipment)
 */
export const EQUIPMENT_PIPELINE = [
  GOAL_TYPES.MINING,
  GOAL_TYPES.CRAFTING,
  GOAL_TYPES.EQUIPMENT
];

/**
 * 体力・満腹度の状態を評価し、回復の必要性を判定する
 * @param {object} bot Mineflayer bot インスタンス
 * @returns {object|null} 緊急の回復アクション要否
 */
export function checkSurvivalNeeds(bot) {
  if (!bot || !bot.entity) return null;

  const health = bot.health ?? 20;
  const food = bot.food ?? 20;

  // 体力14未満またはお腹12未満で食料確保・回復を最優先
  if (health < 14 || food < 12) {
    const isCritical = health < 8 || food < 6;
    return {
      needsRecovery: true,
      isCritical,
      health,
      food,
      recommendedGoal: isCritical ? GOAL_TYPES.COOKING : GOAL_TYPES.FARMING
    };
  }

  return null;
}

/**
 * チャットやコマンドから目標を解析する
 * @param {string} message ユーザーからのテキストメッセージ
 * @returns {object|null} 解析された目標情報 { kind, description, isPipeline }
 */
export function parseGoalCommand(message) {
  const normalized = message.trim().toLowerCase();

  // 装備強化一連パイプライン指定の検出
  if (
    normalized.includes('装備を固める') ||
    normalized.includes('一連の装備') ||
    normalized.includes('装備セット') ||
    normalized.includes('採掘クラフト装備') ||
    normalized.includes('一連の流れ') ||
    normalized === '!goal pipeline' ||
    normalized === '!pipeline'
  ) {
    return {
      kind: 'pipeline',
      pipeline: EQUIPMENT_PIPELINE,
      description: '装備強化パイプライン（採掘 -> クラフト -> 装備）'
    };
  }

  // 単体目標コマンド parse
  const goalAliases = new Map([
    // 装備
    ['equipment', GOAL_TYPES.EQUIPMENT], ['装備', GOAL_TYPES.EQUIPMENT], ['防具', GOAL_TYPES.EQUIPMENT], ['武器', GOAL_TYPES.EQUIPMENT],
    // 採掘
    ['mining', GOAL_TYPES.MINING], ['採掘', GOAL_TYPES.MINING], ['鉱石', GOAL_TYPES.MINING], ['炭鉱', GOAL_TYPES.MINING],
    // クラフト
    ['crafting', GOAL_TYPES.CRAFTING], ['クラフト', GOAL_TYPES.CRAFTING], ['作成', GOAL_TYPES.CRAFTING], ['工作', GOAL_TYPES.CRAFTING],
    // パトロール
    ['patrol', GOAL_TYPES.PATROL], ['パトロール', GOAL_TYPES.PATROL], ['見回り', GOAL_TYPES.PATROL], ['警備', GOAL_TYPES.PATROL],
    // 生存
    ['survival', GOAL_TYPES.SURVIVAL], ['生存', GOAL_TYPES.SURVIVAL], ['回避', GOAL_TYPES.SURVIVAL], ['防衛', GOAL_TYPES.SURVIVAL],
    // 地形把握
    ['terrain_survey', GOAL_TYPES.TERRAIN_SURVEY], ['地形把握', GOAL_TYPES.TERRAIN_SURVEY], ['地形', GOAL_TYPES.TERRAIN_SURVEY], ['マッピング', GOAL_TYPES.TERRAIN_SURVEY], ['測量', GOAL_TYPES.TERRAIN_SURVEY],
    // 街の分析
    ['village_analysis', GOAL_TYPES.VILLAGE_ANALYSIS], ['街の分析', GOAL_TYPES.VILLAGE_ANALYSIS], ['村の分析', GOAL_TYPES.VILLAGE_ANALYSIS], ['村人調査', GOAL_TYPES.VILLAGE_ANALYSIS], ['街調査', GOAL_TYPES.VILLAGE_ANALYSIS],
    // ネザー探検
    ['nether_exploration', GOAL_TYPES.NETHER_EXPLORATION], ['ネザー探検', GOAL_TYPES.NETHER_EXPLORATION], ['ネザー', GOAL_TYPES.NETHER_EXPLORATION], ['地獄探検', GOAL_TYPES.NETHER_EXPLORATION],
    // エンド
    ['end_exploration', GOAL_TYPES.END_EXPLORATION], ['エンド', GOAL_TYPES.END_EXPLORATION], ['果て', GOAL_TYPES.END_EXPLORATION], ['要塞探検', GOAL_TYPES.END_EXPLORATION],
    // 古代都市
    ['ancient_city', GOAL_TYPES.ANCIENT_CITY], ['古代都市', GOAL_TYPES.ANCIENT_CITY], ['ディープダーク', GOAL_TYPES.ANCIENT_CITY], ['スカルク', GOAL_TYPES.ANCIENT_CITY],
    // 雪山
    ['snowy_mountain', GOAL_TYPES.SNOWY_MOUNTAIN], ['雪山', GOAL_TYPES.SNOWY_MOUNTAIN], ['山脈', GOAL_TYPES.SNOWY_MOUNTAIN], ['粉雪', GOAL_TYPES.SNOWY_MOUNTAIN],
    // ポプラ伐採
    ['wood_cutting', GOAL_TYPES.WOOD_CUTTING], ['ポプラ伐採', GOAL_TYPES.WOOD_CUTTING], ['伐採', GOAL_TYPES.WOOD_CUTTING], ['木こり', GOAL_TYPES.WOOD_CUTTING], ['原木採集', GOAL_TYPES.WOOD_CUTTING],
    // 倉庫整理
    ['chest_sorting', GOAL_TYPES.CHEST_SORTING], ['倉庫整理', GOAL_TYPES.CHEST_SORTING], ['チェスト整理', GOAL_TYPES.CHEST_SORTING], ['収納整理', GOAL_TYPES.CHEST_SORTING],
    // 農作業
    ['farming', GOAL_TYPES.FARMING], ['農作業', GOAL_TYPES.FARMING], ['畑仕事', GOAL_TYPES.FARMING], ['収穫', GOAL_TYPES.FARMING],
    // 調理
    ['cooking', GOAL_TYPES.COOKING], ['調理', GOAL_TYPES.COOKING], ['料理', GOAL_TYPES.COOKING], ['ご飯作り', GOAL_TYPES.COOKING],
    // 荷物整理
    ['inventory_sorting', GOAL_TYPES.INVENTORY_SORTING], ['荷物整理', GOAL_TYPES.INVENTORY_SORTING], ['手持ち整理', GOAL_TYPES.INVENTORY_SORTING], ['持ち物整理', GOAL_TYPES.INVENTORY_SORTING]
  ]);

  // !goal <type> コマンドの解析
  const matchGoalCmd = /^!(?:goal|setgoal)\s+(.+)$/i.exec(normalized);
  if (matchGoalCmd) {
    const rawTarget = matchGoalCmd[1].trim();
    const matchedKind = goalAliases.get(rawTarget);
    if (matchedKind) {
      return {
        kind: matchedKind,
        description: GOAL_DESCRIPTIONS[matchedKind]
      };
    }
  }

  // 自然言語でのマッチング
  for (const [alias, kind] of goalAliases.entries()) {
    if (normalized.includes(alias)) {
      return {
        kind,
        description: GOAL_DESCRIPTIONS[kind]
      };
    }
  }

  return null;
}

/**
 * 現在の状態に基づいて、自律行動で選択可能なすべての目標候補を組み立てる
 * @param {object} bot Mineflayer bot インスタンス
 * @param {number} searchRadius 検索半径
 * @returns {Array<object>} 目標の配列
 */
export function buildAvailableGoals(bot, searchRadius = 16) {
  if (!bot || !bot.entity) return [];

  const goals = [];

  // 1. 生存・回復関連（優先度高）
  const survivalNeed = checkSurvivalNeeds(bot);
  if (survivalNeed) {
    goals.push({
      kind: GOAL_TYPES.COOKING,
      priority: 10,
      description: `【優先】体力回復のために調理・食事準備（HP:${survivalNeed.health}, 食料:${survivalNeed.food}）`
    });
    goals.push({
      kind: GOAL_TYPES.FARMING,
      priority: 9,
      description: '【優先】食べ物確保のための農作業（収穫・再植え付け）'
    });
    goals.push({
      kind: GOAL_TYPES.INVENTORY_SORTING,
      priority: 8,
      description: '【優先】食事・資材スロット確保のための荷物整理'
    });
  }

  // 2. 装備固めパイプライン（一連の流れ）
  goals.push({
    kind: 'pipeline',
    priority: 7,
    pipeline: EQUIPMENT_PIPELINE,
    description: '自分の装備を固めるための一連の活動（採掘 -> クラフト -> 装備）'
  });

  // 3. 各種個別目標
  goals.push({
    kind: GOAL_TYPES.EQUIPMENT,
    priority: 6,
    description: '手持ちの最強武具・道具の点検と装備'
  });

  goals.push({
    kind: GOAL_TYPES.MINING,
    priority: 5,
    description: '周囲の鉱石資源（鉄・石炭・ダイヤモンド）の探検と採掘'
  });

  goals.push({
    kind: GOAL_TYPES.CRAFTING,
    priority: 5,
    description: '作業台での道具・防具・アイテムの作成'
  });

  goals.push({
    kind: GOAL_TYPES.PATROL,
    priority: 4,
    description: '拠点周辺の安全を巡回・警戒するパトロール'
  });

  goals.push({
    kind: GOAL_TYPES.SURVIVAL,
    priority: 4,
    description: '危険からの退避と防衛体制の維持（生存行動）'
  });

  goals.push({
    kind: GOAL_TYPES.TERRAIN_SURVEY,
    priority: 3,
    description: '周辺の地形・バイオーム・ランドマークの把握と記録'
  });

  // 近隣の村要素（ベッドや村人など）があるか
  const villagers = Object.values(bot.entities || {}).filter(e => e.name === 'villager');
  goals.push({
    kind: GOAL_TYPES.VILLAGE_ANALYSIS,
    priority: villagers.length > 0 ? 6 : 3,
    description: '村人・建造物・職欄ブロックの配置を調べる街の分析'
  });

  // ネザー探検
  const dimension = String(bot.game?.dimension || '');
  const isNether = dimension.includes('nether');
  goals.push({
    kind: GOAL_TYPES.NETHER_EXPLORATION,
    priority: isNether ? 7 : 2,
    description: 'ネザーの危険物・要塞・有用資源の警戒探検'
  });

  // エンド探検
  const isEnd = dimension.includes('end');
  goals.push({
    kind: GOAL_TYPES.END_EXPLORATION,
    priority: isEnd ? 7 : 2,
    description: 'エンドポータル・エンド要塞・世界の果ての探検'
  });

  // 古代都市探検
  goals.push({
    kind: GOAL_TYPES.ANCIENT_CITY,
    priority: 2,
    description: '古代都市・ディープダークのスカルク検知と静音調査'
  });

  // 雪山探検
  goals.push({
    kind: GOAL_TYPES.SNOWY_MOUNTAIN,
    priority: 2,
    description: '雪山・山脈の粉雪回避と高地調査'
  });

  // ポプラ/木材伐採
  goals.push({
    kind: GOAL_TYPES.WOOD_CUTTING,
    priority: 4,
    description: 'ポプラ・白樺・オークなどの木材の大量伐採と原木収集'
  });

  // 倉庫整理
  goals.push({
    kind: GOAL_TYPES.CHEST_SORTING,
    priority: 3,
    description: '近くのチェストへの手持ちアイテム分類・倉庫整理'
  });

  // 通常の農作業・調理・荷物整理（非緊急時）
  if (!survivalNeed) {
    goals.push({ kind: GOAL_TYPES.FARMING, priority: 3, description: '周囲の畑での農作業（収穫と植え付け）' });
    goals.push({ kind: GOAL_TYPES.COOKING, priority: 3, description: '手持ち食材の調理・備蓄' });
    goals.push({ kind: GOAL_TYPES.INVENTORY_SORTING, priority: 2, description: '持ち物の整理整頓' });
  }

  return goals;
}

/**
 * 優先度を考慮して目標をランダム・スマート選択する
 * @param {Array<object>} goals 目標候補リスト
 * @param {Function} random 乱数生成器
 * @returns {object} 選択された目標
 */
export function selectSmartAutonomyGoal(goals, random = Math.random) {
  if (!goals || goals.length === 0) return null;

  // 最高優先度のグループを抽出
  const maxPriority = Math.max(...goals.map(g => g.priority || 1));
  const topGoals = goals.filter(g => (g.priority || 1) === maxPriority);

  const index = Math.min(topGoals.length - 1, Math.floor(random() * topGoals.length));
  return topGoals[index];
}

/**
 * 食料アイテムを定義
 */
export const FOOD_ITEMS = new Set([
  'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton',
  'cooked_cod', 'cooked_salmon', 'baked_potato', 'bread', 'apple',
  'golden_apple', 'carrot', 'sweet_berries', 'glow_berries'
]);

/**
 * インベントリから最高の食料アイテムを検索する
 * @param {Array<object>} items mineflayer inventory.items()
 * @returns {object|null}
 */
export function findBestFoodItem(items) {
  if (!Array.isArray(items)) return null;
  return items.find(item => FOOD_ITEMS.has(item.name)) || null;
}
