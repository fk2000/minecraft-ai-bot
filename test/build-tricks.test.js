import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBotCommand, parseBuildTrickArg } from '../dist/bot/command.js';
import {
  getTrickById,
  TRICK_BLUEPRINTS,
  checkMaterials,
  formatMaterialRequest,
  formatNaturalGatherList,
  getMaterialSource,
  NATURAL_ITEMS,
  CRAFTED_ITEMS,
} from '../dist/bot/build-tricks.js';

test('parseBuildTrickArg returns correct trick IDs for aliases', () => {
  assert.equal(parseBuildTrickArg('trick1'), 'trick1');
  assert.equal(parseBuildTrickArg('1'), 'trick1');
  assert.equal(parseBuildTrickArg('トリック1'), 'trick1');
  assert.equal(parseBuildTrickArg('イルミ'), 'trick1');
  assert.equal(parseBuildTrickArg('イルミネーション'), 'trick1');
  
  assert.equal(parseBuildTrickArg('trick2'), 'trick2');
  assert.equal(parseBuildTrickArg('花'), 'trick2');
  assert.equal(parseBuildTrickArg('植物'), 'trick2');
  
  assert.equal(parseBuildTrickArg('trick3'), 'trick3');
  assert.equal(parseBuildTrickArg('窓'), 'trick3');
  assert.equal(parseBuildTrickArg('屋根'), 'trick3');
  
  assert.equal(parseBuildTrickArg('trick4'), 'trick4');
  assert.equal(parseBuildTrickArg('アーチ'), 'trick4');
  assert.equal(parseBuildTrickArg('門'), 'trick4');
  
  assert.equal(parseBuildTrickArg('trick5'), 'trick5');
  assert.equal(parseBuildTrickArg('道'), 'trick5');
  assert.equal(parseBuildTrickArg('光る道'), 'trick5');
});

test('parseBuildTrickArg returns list for empty or help/list arguments', () => {
  assert.equal(parseBuildTrickArg(''), 'list');
  assert.equal(parseBuildTrickArg('list'), 'list');
  assert.equal(parseBuildTrickArg('一覧'), 'list');
  assert.equal(parseBuildTrickArg('help'), 'list');
});

test('parseBuildTrickArg returns null for unknown aliases', () => {
  assert.equal(parseBuildTrickArg('unknown'), null);
  assert.equal(parseBuildTrickArg('trick99'), null);
  assert.equal(parseBuildTrickArg('ランダム'), null);
});

test('parseBuildTrickArg returns hut for hut aliases', () => {
  assert.equal(parseBuildTrickArg('hut'), 'hut');
  assert.equal(parseBuildTrickArg('小屋'), 'hut');
  assert.equal(parseBuildTrickArg('こや'), 'hut');
});

test('parseBotCommand parses build commands with trick arguments', () => {
  const cmd1 = parseBotCommand('!build trick1');
  assert.deepEqual(cmd1, { type: 'build', trick: 'trick1' });
  
  const cmd2 = parseBotCommand('!build イルミ');
  assert.deepEqual(cmd2, { type: 'build', trick: 'trick1' });
  
  const cmdList = parseBotCommand('!build');
  assert.deepEqual(cmdList, { type: 'build', trick: 'list' });
  
  const cmdListJa = parseBotCommand('!build 一覧');
  assert.deepEqual(cmdListJa, { type: 'build', trick: 'list' });
  
  const cmdUnknown = parseBotCommand('!build unknown');
  assert.deepEqual(cmdUnknown, { type: 'build', trick: null });
});

test('TRICK_BLUEPRINTS contains all 5 tricks', () => {
  assert.equal(TRICK_BLUEPRINTS.length, 5);
  
  const ids = TRICK_BLUEPRINTS.map(t => t.id);
  assert.ok(ids.includes('trick1'));
  assert.ok(ids.includes('trick2'));
  assert.ok(ids.includes('trick3'));
  assert.ok(ids.includes('trick4'));
  assert.ok(ids.includes('trick5'));
});

test('getTrickById returns correct blueprint', () => {
  const trick1 = getTrickById('trick1');
  assert.ok(trick1);
  assert.equal(trick1.id, 'trick1');
  assert.equal(trick1.nameJa, 'イルミネーション');
  
  const trick5 = getTrickById('trick5');
  assert.ok(trick5);
  assert.equal(trick5.id, 'trick5');
  assert.equal(trick5.nameJa, '光る赤い道');
  
  const unknown = getTrickById('trick99');
  assert.equal(unknown, null);
});

test('getMaterialSource correctly classifies natural vs crafted items', () => {
  assert.equal(getMaterialSource('stone'), 'natural');
  assert.equal(getMaterialSource('dirt'), 'natural');
  assert.equal(getMaterialSource('snow'), 'natural');
  assert.equal(getMaterialSource('redstone_ore'), 'natural');
  assert.equal(getMaterialSource('coarse_dirt'), 'natural');
  assert.equal(getMaterialSource('rose_bush'), 'natural');
  assert.equal(getMaterialSource('chicken'), 'natural');
  
  assert.equal(getMaterialSource('lead'), 'crafted');
  assert.equal(getMaterialSource('lantern'), 'crafted');
  assert.equal(getMaterialSource('moss_carpet'), 'crafted');
  assert.equal(getMaterialSource('ochre_froglight'), 'crafted');
  assert.equal(getMaterialSource('anvil'), 'crafted');
  assert.equal(getMaterialSource('red_carpet'), 'crafted');
  assert.equal(getMaterialSource('black_concrete'), 'crafted');
});

test('checkMaterials detects missing items correctly', () => {
  const blueprint = getTrickById('trick2');
  assert.ok(blueprint);
  
  const emptyInventory = [];
  const result1 = checkMaterials(blueprint, emptyInventory);
  assert.equal(result1.ready, false);
  assert.ok(result1.missing.length > 0);
  
  const fullInventory = [
    { name: 'snow', count: 10 },
    { name: 'moss_carpet', count: 5 },
    { name: 'rose_bush', count: 3 },
  ];
  const result2 = checkMaterials(blueprint, fullInventory);
  assert.equal(result2.ready, true);
  assert.equal(result2.missing.length, 0);
});

test('checkMaterials considers alternative items', () => {
  const blueprint = getTrickById('trick2');
  assert.ok(blueprint);
  
  const inventoryWithAlt = [
    { name: 'snow', count: 10 },
    { name: 'moss_carpet', count: 5 },
    { name: 'peony', count: 3 },
  ];
  const result = checkMaterials(blueprint, inventoryWithAlt);
  assert.equal(result.ready, true);
});

test('formatMaterialRequest generates Japanese request for crafted items only', () => {
  const missing = [
    { item: 'lead', displayName: 'リード', needed: 2, have: 0, source: 'crafted' },
    { item: 'snow', displayName: '雪', needed: 4, have: 0, source: 'natural' },
    { item: 'lantern', displayName: 'ランタン', needed: 6, have: 2, source: 'crafted' },
  ];
  
  const request = formatMaterialRequest(missing);
  assert.ok(request.includes('リードを2個'));
  assert.ok(request.includes('ランタンを4個'));
  assert.ok(request.includes('ください'));
  assert.ok(!request.includes('雪'));
});

test('formatNaturalGatherList lists only natural items', () => {
  const missing = [
    { item: 'lead', displayName: 'リード', needed: 2, have: 0, source: 'crafted' },
    { item: 'snow', displayName: '雪', needed: 4, have: 1, source: 'natural' },
    { item: 'coarse_dirt', displayName: '粗い土', needed: 10, have: 5, source: 'natural' },
  ];
  
  const gatherList = formatNaturalGatherList(missing);
  assert.ok(gatherList.includes('雪'));
  assert.ok(gatherList.includes('3個必要'));
  assert.ok(gatherList.includes('粗い土'));
  assert.ok(gatherList.includes('5個必要'));
  assert.ok(!gatherList.includes('リード'));
});

test('each trick blueprint has valid materials with correct source classification', () => {
  for (const blueprint of TRICK_BLUEPRINTS) {
    assert.ok(blueprint.materials.length > 0, `${blueprint.id} should have materials`);
    
    for (const material of blueprint.materials) {
      assert.ok(material.item, `${blueprint.id} material should have item name`);
      assert.ok(material.displayName, `${blueprint.id} material should have displayName`);
      assert.ok(material.count > 0, `${blueprint.id} material count should be positive`);
      assert.ok(
        material.source === 'natural' || material.source === 'crafted',
        `${blueprint.id} material should have valid source`
      );
    }
  }
});

test('each trick blueprint has valid steps', () => {
  const validActions = ['dig', 'place', 'spawn_entity', 'use_item', 'wait', 'remove'];
  
  for (const blueprint of TRICK_BLUEPRINTS) {
    assert.ok(blueprint.steps.length > 0, `${blueprint.id} should have steps`);
    
    for (const step of blueprint.steps) {
      assert.ok(
        validActions.includes(step.action),
        `${blueprint.id} step should have valid action: ${step.action}`
      );
      assert.ok(
        typeof step.position.x === 'number' &&
        typeof step.position.y === 'number' &&
        typeof step.position.z === 'number',
        `${blueprint.id} step should have valid position`
      );
    }
  }
});
