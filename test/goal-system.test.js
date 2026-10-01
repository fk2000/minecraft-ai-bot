import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GOAL_TYPES,
  GOAL_DESCRIPTIONS,
  EQUIPMENT_PIPELINE,
  parseGoalCommand,
  checkSurvivalNeeds,
  buildAvailableGoals,
  selectSmartAutonomyGoal,
  findBestFoodItem
} from '../src/goal-system.js';
import { executeGoalAction } from '../src/goal-actions.js';

test('GOAL_TYPES contains all requested 13+ goal types and recovery goals', () => {
  const expectedKeys = [
    'FARMING', 'COOKING', 'INVENTORY_SORTING',
    'MINING', 'CRAFTING', 'EQUIPMENT',
    'PATROL', 'SURVIVAL', 'TERRAIN_SURVEY', 'VILLAGE_ANALYSIS',
    'NETHER_EXPLORATION', 'END_EXPLORATION', 'ANCIENT_CITY',
    'SNOWY_MOUNTAIN', 'WOOD_CUTTING', 'CHEST_SORTING'
  ];

  for (const key of expectedKeys) {
    assert.ok(GOAL_TYPES[key], `GOAL_TYPES.${key} should be defined`);
    assert.ok(GOAL_DESCRIPTIONS[GOAL_TYPES[key]], `Description for ${key} should be defined`);
  }
});

test('EQUIPMENT_PIPELINE defines sequential flow of mining -> crafting -> equipment', () => {
  assert.deepEqual(EQUIPMENT_PIPELINE, [
    GOAL_TYPES.MINING,
    GOAL_TYPES.CRAFTING,
    GOAL_TYPES.EQUIPMENT
  ]);
});

test('parseGoalCommand recognizes pipeline and individual goal requests', () => {
  // 装備強化一連の流れ
  const pipelineReq = parseGoalCommand('自分の装備を固めるための活動');
  assert.equal(pipelineReq.kind, 'pipeline');
  assert.deepEqual(pipelineReq.pipeline, EQUIPMENT_PIPELINE);

  // コマンド解析
  const miningReq = parseGoalCommand('!goal mining');
  assert.equal(miningReq.kind, GOAL_TYPES.MINING);

  // 日本語フレーズ解析
  const patrolReq = parseGoalCommand('拠点をパトロールして');
  assert.equal(patrolReq.kind, GOAL_TYPES.PATROL);

  const ancientReq = parseGoalCommand('古代都市を探検する');
  assert.equal(ancientReq.kind, GOAL_TYPES.ANCIENT_CITY);

  const woodReq = parseGoalCommand('ポプラ伐採をお願い');
  assert.equal(woodReq.kind, GOAL_TYPES.WOOD_CUTTING);

  const chestReq = parseGoalCommand('倉庫整理をして');
  assert.equal(chestReq.kind, GOAL_TYPES.CHEST_SORTING);

  const farmReq = parseGoalCommand('畑仕事をしてきて');
  assert.equal(farmReq.kind, GOAL_TYPES.FARMING);

  const cookReq = parseGoalCommand('ご飯作り');
  assert.equal(cookReq.kind, GOAL_TYPES.COOKING);
});

test('checkSurvivalNeeds accurately detects low health or food', () => {
  const healthyBot = { entity: {}, health: 20, food: 20 };
  assert.equal(checkSurvivalNeeds(healthyBot), null);

  const lowHealthBot = { entity: {}, health: 10, food: 20 };
  const healthRes = checkSurvivalNeeds(lowHealthBot);
  assert.ok(healthRes);
  assert.equal(healthRes.needsRecovery, true);

  const lowFoodBot = { entity: {}, health: 20, food: 5 };
  const foodRes = checkSurvivalNeeds(lowFoodBot);
  assert.ok(foodRes);
  assert.equal(foodRes.isCritical, true);
  assert.equal(foodRes.recommendedGoal, GOAL_TYPES.COOKING);
});

test('buildAvailableGoals lists available objectives with priority', () => {
  const dummyBot = {
    entity: { position: { floored: () => ({ x: 0, y: 64, z: 0 }) } },
    health: 20,
    food: 20,
    entities: {}
  };

  const goals = buildAvailableGoals(dummyBot);
  assert.ok(goals.length > 10);
  const kinds = goals.map(g => g.kind);

  assert.ok(kinds.includes('pipeline'));
  assert.ok(kinds.includes(GOAL_TYPES.EQUIPMENT));
  assert.ok(kinds.includes(GOAL_TYPES.MINING));
  assert.ok(kinds.includes(GOAL_TYPES.CRAFTING));
  assert.ok(kinds.includes(GOAL_TYPES.WOOD_CUTTING));
  assert.ok(kinds.includes(GOAL_TYPES.CHEST_SORTING));
});

test('selectSmartAutonomyGoal selects top priority goals', () => {
  const goals = [
    { kind: 'low', priority: 1 },
    { kind: 'high', priority: 10 },
    { kind: 'medium', priority: 5 }
  ];

  const selected = selectSmartAutonomyGoal(goals);
  assert.equal(selected.kind, 'high');
});

test('findBestFoodItem returns valid edible items from inventory', () => {
  const items = [
    { name: 'cobblestone' },
    { name: 'cooked_beef' },
    { name: 'iron_ingot' }
  ];

  const bestFood = findBestFoodItem(items);
  assert.equal(bestFood.name, 'cooked_beef');
});

test('executeGoalAction returns structured output for goal execution', async () => {
  const mockBot = {
    entity: { position: { floored: () => ({ x: 10, y: 64, z: 10 }), distanceTo: () => 100 } },
    game: { dimension: 'overworld' },
    inventory: { items: () => [] },
    entities: {},
    pathfinder: { goto: async () => {} },
    findBlock: () => null,
    findBlocks: () => []
  };

  const mockGoalNear = function(x, y, z, r) { return { x, y, z, r }; };

  const equipResult = await executeGoalAction({ kind: GOAL_TYPES.EQUIPMENT }, mockBot, mockGoalNear);
  assert.ok(equipResult.success);

  const surveyResult = await executeGoalAction({ kind: GOAL_TYPES.TERRAIN_SURVEY }, mockBot, mockGoalNear);
  assert.ok(surveyResult.success);
  assert.ok(surveyResult.message.includes('現在地の地形を計測'));

  const pipelineResult = await executeGoalAction({ kind: 'pipeline' }, mockBot, mockGoalNear);
  assert.ok(pipelineResult.success);
  assert.ok(pipelineResult.message.includes('装備強化ワークフロー完了'));
});
