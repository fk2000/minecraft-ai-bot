/**
 * Robust Block Placement Helper
 * Handles pathfinding, retry logic, verification, and error reporting for block placement
 */

import type { Bot } from 'mineflayer';
import type { Block as PrismarineBlock } from 'prismarine-block';
import type { Vec3 } from 'vec3';
import type { goals as PathfinderGoals } from 'mineflayer-pathfinder';

export interface PlacementOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  verifyDelayMs?: number;
  maxPlacementDistance?: number;
  GoalNear?: typeof PathfinderGoals.GoalNear;
}

export interface PlacementResult {
  success: boolean;
  error?: PlacementError;
  attempts: number;
}

export type PlacementError =
  | { type: 'no_item'; item: string }
  | { type: 'no_reference'; position: Vec3 }
  | { type: 'too_far'; position: Vec3; distance: number }
  | { type: 'server_rejected'; position: Vec3; reason: string }
  | { type: 'verification_failed'; position: Vec3 }
  | { type: 'protection_likely'; position: Vec3 }
  | { type: 'pathfinding_failed'; position: Vec3; reason: string }
  | { type: 'cancelled' };

const DEFAULT_OPTIONS: Required<Omit<PlacementOptions, 'GoalNear'>> = {
  maxRetries: 3,
  retryDelayMs: 500,
  verifyDelayMs: 100,
  maxPlacementDistance: 4.5,
};

const REFERENCE_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];

export function formatPlacementError(error: PlacementError): string {
  switch (error.type) {
    case 'no_item':
      return `${error.item}がインベントリにないよ。`;
    case 'no_reference':
      return `設置する足場が見つからないよ（${error.position.x}, ${error.position.y}, ${error.position.z}）`;
    case 'too_far':
      return `設置位置が遠すぎるよ（距離: ${error.distance.toFixed(1)}ブロック）`;
    case 'server_rejected':
      return `サーバーが設置を拒否したよ: ${error.reason}`;
    case 'verification_failed':
      return `ブロックの設置を確認できなかったよ（保護エリアや権限の問題かも）`;
    case 'protection_likely':
      return `このエリアは保護されているか、建築権限がないみたい。場所を変えてみてね。`;
    case 'pathfinding_failed':
      return `設置位置に近づけなかったよ: ${error.reason}`;
    case 'cancelled':
      return '建築がキャンセルされました';
  }
}

export function formatPlacementErrorJa(error: PlacementError): string {
  return formatPlacementError(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function findAllPlacementReferences(
  bot: Bot,
  position: Vec3
): Array<{ block: PrismarineBlock; faceVector: Vec3 }> {
  const results: Array<{ block: PrismarineBlock; faceVector: Vec3 }> = [];

  for (const [dx, dy, dz] of REFERENCE_OFFSETS) {
    const adjacentPos = position.offset(dx, dy, dz);
    const block = bot.blockAt(adjacentPos);
    
    if (block && block.boundingBox === 'block') {
      const faceVector = position.minus(adjacentPos);
      results.push({ block, faceVector });
    }
  }

  return results;
}

export function findBestPlacementReference(
  bot: Bot,
  position: Vec3
): { block: PrismarineBlock; faceVector: Vec3 } | null {
  const references = findAllPlacementReferences(bot, position);
  
  if (references.length === 0) return null;

  const botPos = bot.entity.position;
  
  references.sort((a, b) => {
    const distA = botPos.distanceTo(a.block.position);
    const distB = botPos.distanceTo(b.block.position);
    
    const priorityA = a.faceVector.y === 1 ? 0 : (a.faceVector.y === -1 ? 2 : 1);
    const priorityB = b.faceVector.y === 1 ? 0 : (b.faceVector.y === -1 ? 2 : 1);
    
    if (priorityA !== priorityB) return priorityA - priorityB;
    return distA - distB;
  });

  return references[0];
}

export async function moveCloseToPosition(
  bot: Bot,
  position: Vec3,
  maxDistance: number,
  GoalNear?: typeof PathfinderGoals.GoalNear
): Promise<{ success: boolean; error?: string }> {
  const currentDistance = bot.entity.position.distanceTo(position);
  
  if (currentDistance <= maxDistance) {
    return { success: true };
  }

  if (!GoalNear) {
    return { 
      success: false, 
      error: `距離が遠すぎます (${currentDistance.toFixed(1)} > ${maxDistance})` 
    };
  }

  try {
    await bot.pathfinder.goto(new GoalNear(
      position.x,
      position.y,
      position.z,
      Math.max(1, maxDistance - 1)
    ));
    
    const newDistance = bot.entity.position.distanceTo(position);
    if (newDistance <= maxDistance + 1) {
      return { success: true };
    }
    
    return { 
      success: false, 
      error: `移動後も距離が遠い (${newDistance.toFixed(1)})` 
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function verifyBlockPlaced(
  bot: Bot,
  position: Vec3,
  expectedBlock?: string,
  delayMs: number = 100
): Promise<boolean> {
  await sleep(delayMs);
  
  const block = bot.blockAt(position);
  if (!block) return false;
  
  if (block.name === 'air') return false;
  
  if (expectedBlock) {
    return block.name === expectedBlock || block.name.includes(expectedBlock.replace('minecraft:', ''));
  }
  
  return block.boundingBox !== 'empty' || block.name !== 'air';
}

export async function placeBlockRobust(
  bot: Bot,
  position: Vec3,
  itemName: string,
  options: PlacementOptions = {}
): Promise<PlacementResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempts = 0;
  let lastError: PlacementError | undefined;
  let consecutiveServerRejects = 0;

  for (let retry = 0; retry <= opts.maxRetries; retry++) {
    attempts++;

    const item = bot.inventory.items().find(i => 
      i.name === itemName || 
      i.name.includes(itemName) || 
      itemName.includes(i.name)
    );
    
    if (!item) {
      return { success: false, error: { type: 'no_item', item: itemName }, attempts };
    }

    const moveResult = await moveCloseToPosition(
      bot,
      position,
      opts.maxPlacementDistance,
      opts.GoalNear
    );
    
    if (!moveResult.success) {
      lastError = { 
        type: 'pathfinding_failed', 
        position, 
        reason: moveResult.error ?? 'Unknown' 
      };
      await sleep(opts.retryDelayMs);
      continue;
    }

    const distance = bot.entity.position.distanceTo(position);
    if (distance > opts.maxPlacementDistance + 1) {
      lastError = { type: 'too_far', position, distance };
      await sleep(opts.retryDelayMs);
      continue;
    }

    const reference = findBestPlacementReference(bot, position);
    if (!reference) {
      lastError = { type: 'no_reference', position };
      await sleep(opts.retryDelayMs);
      continue;
    }

    try {
      await bot.equip(item, 'hand');
      
      await bot.lookAt(reference.block.position.offset(0.5, 0.5, 0.5));
      await sleep(50);
      
      await bot.placeBlock(reference.block, reference.faceVector);
      
      const verified = await verifyBlockPlaced(bot, position, itemName, opts.verifyDelayMs);
      
      if (verified) {
        return { success: true, attempts };
      }
      
      consecutiveServerRejects++;
      lastError = { type: 'verification_failed', position };
      
      if (consecutiveServerRejects >= 2) {
        return { 
          success: false, 
          error: { type: 'protection_likely', position }, 
          attempts 
        };
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      if (message.includes('still air') || message.includes('refused')) {
        consecutiveServerRejects++;
        lastError = { type: 'server_rejected', position, reason: message };
        
        if (consecutiveServerRejects >= 2) {
          return { 
            success: false, 
            error: { type: 'protection_likely', position }, 
            attempts 
          };
        }
      } else {
        lastError = { type: 'server_rejected', position, reason: message };
      }
    }

    if (retry < opts.maxRetries) {
      await sleep(opts.retryDelayMs * (retry + 1));
    }
  }

  return { success: false, error: lastError, attempts };
}

export async function placeBlockWithScaffolding(
  bot: Bot,
  position: Vec3,
  itemName: string,
  scaffoldItem: string,
  options: PlacementOptions = {}
): Promise<PlacementResult> {
  const references = findAllPlacementReferences(bot, position);
  
  if (references.length > 0) {
    return placeBlockRobust(bot, position, itemName, options);
  }

  const belowPos = position.offset(0, -1, 0);
  const belowBlock = bot.blockAt(belowPos);
  
  if (!belowBlock || belowBlock.name === 'air') {
    const scaffoldResult = await placeBlockRobust(bot, belowPos, scaffoldItem, options);
    
    if (!scaffoldResult.success) {
      return {
        success: false,
        error: { type: 'no_reference', position },
        attempts: scaffoldResult.attempts,
      };
    }
  }

  return placeBlockRobust(bot, position, itemName, options);
}

export interface BuildPlanResult {
  success: boolean;
  placed: number;
  failed: number;
  errors: Array<{ position: Vec3; error: PlacementError }>;
  protectionDetected: boolean;
}

export async function executeBuildPlan(
  bot: Bot,
  positions: Vec3[],
  itemName: string,
  options: PlacementOptions & { 
    onProgress?: (placed: number, total: number) => void;
    isCancelled?: () => boolean;
  } = {}
): Promise<BuildPlanResult> {
  const { onProgress, isCancelled, ...placementOptions } = options;
  
  let placed = 0;
  let failed = 0;
  const errors: Array<{ position: Vec3; error: PlacementError }> = [];
  let protectionDetected = false;

  for (let i = 0; i < positions.length; i++) {
    if (isCancelled?.()) {
      break;
    }

    const position = positions[i];
    
    const existingBlock = bot.blockAt(position);
    if (existingBlock && existingBlock.name !== 'air' && existingBlock.boundingBox !== 'empty') {
      placed++;
      onProgress?.(placed, positions.length);
      continue;
    }

    const result = await placeBlockRobust(bot, position, itemName, placementOptions);
    
    if (result.success) {
      placed++;
    } else {
      failed++;
      if (result.error) {
        errors.push({ position, error: result.error });
        if (result.error.type === 'protection_likely') {
          protectionDetected = true;
          break;
        }
      }
    }

    onProgress?.(placed, positions.length);
    
    await sleep(100);
  }

  return {
    success: failed === 0 && !protectionDetected,
    placed,
    failed,
    errors,
    protectionDetected,
  };
}
