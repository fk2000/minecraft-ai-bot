import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatPlacementError,
  findAllPlacementReferences,
  findBestPlacementReference,
} from '../dist/bot/block-placer.js';

test('formatPlacementError returns Japanese messages for all error types', () => {
  assert.ok(formatPlacementError({ type: 'no_item', item: 'oak_planks' }).includes('インベントリ'));
  assert.ok(formatPlacementError({ type: 'no_reference', position: { x: 0, y: 0, z: 0 } }).includes('足場'));
  assert.ok(formatPlacementError({ type: 'too_far', position: { x: 0, y: 0, z: 0 }, distance: 10 }).includes('遠すぎる'));
  assert.ok(formatPlacementError({ type: 'server_rejected', position: { x: 0, y: 0, z: 0 }, reason: 'test' }).includes('拒否'));
  assert.ok(formatPlacementError({ type: 'verification_failed', position: { x: 0, y: 0, z: 0 } }).includes('確認できなかった'));
  assert.ok(formatPlacementError({ type: 'protection_likely', position: { x: 0, y: 0, z: 0 } }).includes('保護'));
  assert.ok(formatPlacementError({ type: 'pathfinding_failed', position: { x: 0, y: 0, z: 0 }, reason: 'test' }).includes('近づけなかった'));
  assert.ok(formatPlacementError({ type: 'cancelled' }).includes('キャンセル'));
});

function makeVec3(x, y, z) {
  return {
    x, y, z,
    offset: (dx, dy, dz) => makeVec3(x + dx, y + dy, z + dz),
    minus: (other) => makeVec3(x - other.x, y - other.y, z - other.z),
  };
}

test('findAllPlacementReferences returns empty array when no solid blocks adjacent', () => {
  const mockBot = {
    blockAt: () => ({ name: 'air', boundingBox: 'empty' }),
  };
  
  const position = makeVec3(0, 64, 0);
  const results = findAllPlacementReferences(mockBot, position);
  
  assert.equal(results.length, 0);
});

test('findAllPlacementReferences finds solid blocks in all directions', () => {
  const mockBot = {
    blockAt: (pos) => {
      if (pos.y === 63) {
        return { name: 'stone', boundingBox: 'block', position: { x: pos.x, y: 63, z: pos.z } };
      }
      return { name: 'air', boundingBox: 'empty' };
    },
  };
  
  const position = makeVec3(0, 64, 0);
  
  const results = findAllPlacementReferences(mockBot, position);
  
  assert.equal(results.length, 1);
  assert.equal(results[0].block.name, 'stone');
});

test('findBestPlacementReference prefers blocks below (ground)', () => {
  const mockBot = {
    entity: { position: { distanceTo: () => 1 } },
    blockAt: (pos) => {
      if (pos.x === 0 && pos.y === 63 && pos.z === 0) {
        return { name: 'grass_block', boundingBox: 'block', position: { x: 0, y: 63, z: 0 } };
      }
      if (pos.x === 1 && pos.y === 64 && pos.z === 0) {
        return { name: 'stone', boundingBox: 'block', position: { x: 1, y: 64, z: 0 } };
      }
      return { name: 'air', boundingBox: 'empty' };
    },
  };
  
  const position = makeVec3(0, 64, 0);
  
  const result = findBestPlacementReference(mockBot, position);
  
  assert.ok(result);
  assert.equal(result.block.name, 'grass_block');
  assert.equal(result.faceVector.y, 1);
});

test('findBestPlacementReference returns null when no references exist', () => {
  const mockBot = {
    entity: { position: { distanceTo: () => 1 } },
    blockAt: () => ({ name: 'air', boundingBox: 'empty' }),
  };
  
  const position = makeVec3(0, 64, 0);
  
  const result = findBestPlacementReference(mockBot, position);
  
  assert.equal(result, null);
});
