/**
 * Build Tricks Executor
 * Handles material gathering, chat requests, and block placement for building tricks
 */

import type { Bot } from 'mineflayer';
import type { Block as MineflayerBlock } from 'prismarine-block';
import type { Vec3 } from 'vec3';
import type { goals as PathfinderGoals } from 'mineflayer-pathfinder';
import {
  type TrickBlueprint,
  type MaterialCheckResult,
  type BuildStep,
  checkMaterials,
  formatMaterialRequest,
  formatNaturalGatherList,
  findGatherableBlocks,
  offsetPosition,
  getMaterialSource,
} from './build-tricks.js';

export interface BuildExecutionContext {
  bot: Bot;
  GoalNear: typeof PathfinderGoals.GoalNear;
  origin: Vec3;
  blueprint: TrickBlueprint;
  cancelled: boolean;
  chatMessage: (text: string) => void;
  onProgress?: (message: string) => void;
}

export interface BuildExecutionResult {
  success: boolean;
  message: string;
  completedSteps: number;
  totalSteps: number;
}

const MATERIAL_WAIT_TIMEOUT_MS = 120_000;
const MATERIAL_CHECK_INTERVAL_MS = 5_000;
const MAX_GATHER_ATTEMPTS = 3;

export async function gatherNaturalMaterial(
  ctx: BuildExecutionContext,
  itemName: string,
  needed: number
): Promise<{ success: boolean; gathered: number; message: string }> {
  const { bot, GoalNear } = ctx;
  let gathered = 0;
  let attempts = 0;

  ctx.onProgress?.(`${itemName}を採集中...`);

  while (gathered < needed && attempts < MAX_GATHER_ATTEMPTS && !ctx.cancelled) {
    attempts++;

    const blocks = await findGatherableBlocks(bot, itemName, needed - gathered, 48);
    
    if (blocks.length === 0) {
      ctx.onProgress?.(`${itemName}が周囲に見つからないよ（${attempts}/${MAX_GATHER_ATTEMPTS}回目）`);
      await sleep(2000);
      continue;
    }

    for (const blockInfo of blocks) {
      if (ctx.cancelled) break;
      if (gathered >= needed) break;

      try {
        const block = bot.blockAt(blockInfo.position);
        if (!block) continue;

        await bot.pathfinder.goto(new GoalNear(
          blockInfo.position.x,
          blockInfo.position.y,
          blockInfo.position.z,
          2
        ));

        if (ctx.cancelled) break;

        const currentBlock = bot.blockAt(blockInfo.position);
        if (!currentBlock || !bot.canDigBlock(currentBlock)) continue;

        const pickaxe = findBestTool(bot, currentBlock);
        if (pickaxe) {
          await bot.equip(pickaxe, 'hand');
        }

        await bot.dig(currentBlock);
        gathered++;
        ctx.onProgress?.(`${itemName}を採集: ${gathered}/${needed}`);
      } catch (error) {
        console.warn(`[build-tricks] Failed to gather ${itemName}:`, error);
      }
    }
  }

  return {
    success: gathered >= needed,
    gathered,
    message: gathered >= needed 
      ? `${itemName}を${gathered}個採集完了` 
      : `${itemName}が${needed - gathered}個不足（周囲に見つからない）`,
  };
}

export async function requestCraftedMaterials(
  ctx: BuildExecutionContext,
  missing: MaterialCheckResult['missing']
): Promise<{ success: boolean; message: string }> {
  const craftedMissing = missing.filter(m => m.source === 'crafted');
  
  if (craftedMissing.length === 0) {
    return { success: true, message: '' };
  }

  const requestMessage = formatMaterialRequest(craftedMissing);
  ctx.chatMessage(requestMessage);
  ctx.onProgress?.(`アイテムをリクエスト中: ${requestMessage}`);

  const startTime = Date.now();
  let lastRequestTime = startTime;
  
  while (Date.now() - startTime < MATERIAL_WAIT_TIMEOUT_MS && !ctx.cancelled) {
    await sleep(MATERIAL_CHECK_INTERVAL_MS);
    
    if (ctx.cancelled) {
      return { success: false, message: '建築がキャンセルされました' };
    }

    const inventoryItems = ctx.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
    }));

    const currentCheck = checkMaterials(ctx.blueprint, inventoryItems);
    const stillMissing = currentCheck.missing.filter(m => m.source === 'crafted');
    
    if (stillMissing.length === 0) {
      ctx.onProgress?.('必要なアイテムがすべて揃いました！');
      return { success: true, message: '必要なアイテムがすべて揃いました' };
    }

    if (Date.now() - lastRequestTime > 30_000) {
      const reRequestMessage = formatMaterialRequest(stillMissing);
      ctx.chatMessage(`まだ${reRequestMessage}`);
      lastRequestTime = Date.now();
    }
  }

  return { 
    success: false, 
    message: `タイムアウト: ${craftedMissing.map(m => m.displayName).join('、')}がまだ不足しています` 
  };
}

export async function executeBuildStep(
  ctx: BuildExecutionContext,
  step: BuildStep,
  stepIndex: number
): Promise<{ success: boolean; message: string }> {
  const { bot, GoalNear, origin } = ctx;
  const worldPos = offsetPosition(origin, step.position);

  try {
    switch (step.action) {
      case 'dig': {
        const block = bot.blockAt(worldPos);
        if (!block || block.name === 'air') {
          return { success: true, message: `既に空洞: ${step.comment ?? ''}` };
        }

        await bot.pathfinder.goto(new GoalNear(worldPos.x, worldPos.y, worldPos.z, 2));
        
        if (ctx.cancelled) return { success: false, message: 'キャンセル' };

        const tool = findBestTool(bot, block);
        if (tool) await bot.equip(tool, 'hand');

        await bot.dig(block);
        return { success: true, message: `掘削完了: ${step.comment ?? ''}` };
      }

      case 'place': {
        if (!step.block) {
          return { success: false, message: 'ブロックが指定されていません' };
        }

        const existingBlock = bot.blockAt(worldPos);
        if (existingBlock && existingBlock.name !== 'air' && 
            existingBlock.boundingBox !== 'empty') {
          return { success: true, message: `既にブロックあり: ${existingBlock.name}` };
        }

        await bot.pathfinder.goto(new GoalNear(worldPos.x, worldPos.y, worldPos.z, 3));
        
        if (ctx.cancelled) return { success: false, message: 'キャンセル' };

        const item = findItemInInventory(bot, step.block);
        if (!item) {
          return { success: false, message: `${step.block}がインベントリにありません` };
        }

        await bot.equip(item, 'hand');

        const referenceBlock = findPlacementReference(bot, worldPos);
        if (!referenceBlock) {
          return { success: false, message: '設置する足場が見つかりません' };
        }

        const faceVector = worldPos.minus(referenceBlock.position);
        await bot.placeBlock(referenceBlock, faceVector);
        
        return { success: true, message: `設置完了: ${step.block} ${step.comment ?? ''}` };
      }

      case 'remove': {
        const block = bot.blockAt(worldPos);
        if (!block || block.name === 'air') {
          return { success: true, message: `既に除去済み: ${step.comment ?? ''}` };
        }

        await bot.pathfinder.goto(new GoalNear(worldPos.x, worldPos.y, worldPos.z, 2));
        
        if (ctx.cancelled) return { success: false, message: 'キャンセル' };

        await bot.dig(block);
        return { success: true, message: `除去完了: ${step.comment ?? ''}` };
      }

      case 'spawn_entity': {
        if (!step.entity) {
          return { success: false, message: 'エンティティが指定されていません' };
        }
        
        ctx.onProgress?.(`${step.entity}のスポーンはプレイヤーの手動対応が必要です`);
        return { 
          success: true, 
          message: `${step.entity}スポーン位置を準備（手動でスポーン/配置してください）` 
        };
      }

      case 'use_item': {
        if (!step.block) {
          return { success: false, message: 'アイテムが指定されていません' };
        }

        const item = findItemInInventory(bot, step.block);
        if (!item) {
          return { success: false, message: `${step.block}がインベントリにありません` };
        }

        await bot.equip(item, 'hand');
        
        ctx.onProgress?.(`${step.block}の使用はプレイヤーの手動対応が必要な場合があります`);
        return { 
          success: true, 
          message: `${step.block}を手に持ちました ${step.comment ?? ''}` 
        };
      }

      case 'wait': {
        await sleep(1000);
        return { success: true, message: '待機完了' };
      }

      default:
        return { success: false, message: `不明なアクション: ${(step as BuildStep).action}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `ステップ${stepIndex + 1}でエラー: ${errorMessage}` };
  }
}

export async function executeBuildTrick(
  ctx: BuildExecutionContext
): Promise<BuildExecutionResult> {
  const { bot, blueprint } = ctx;
  let completedSteps = 0;

  ctx.onProgress?.(`建築開始: ${blueprint.nameJa} (${blueprint.name})`);

  const inventoryItems = bot.inventory.items().map(item => ({
    name: item.name,
    count: item.count,
  }));
  const materialCheck = checkMaterials(blueprint, inventoryItems);

  if (!materialCheck.ready) {
    const naturalMissing = materialCheck.missing.filter(m => m.source === 'natural');
    for (const material of naturalMissing) {
      if (ctx.cancelled) {
        return {
          success: false,
          message: '建築がキャンセルされました',
          completedSteps,
          totalSteps: blueprint.steps.length,
        };
      }

      const needed = material.needed - material.have;
      const gatherResult = await gatherNaturalMaterial(ctx, material.item, needed);
      
      if (!gatherResult.success) {
        ctx.onProgress?.(gatherResult.message);
      }
    }

    const updatedInventory = bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
    }));
    const updatedCheck = checkMaterials(blueprint, updatedInventory);

    if (updatedCheck.missing.some(m => m.source === 'crafted')) {
      const requestResult = await requestCraftedMaterials(ctx, updatedCheck.missing);
      
      if (!requestResult.success) {
        return {
          success: false,
          message: requestResult.message,
          completedSteps,
          totalSteps: blueprint.steps.length,
        };
      }
    }
  }

  ctx.onProgress?.(`ブロック設置開始（全${blueprint.steps.length}ステップ）`);

  for (let i = 0; i < blueprint.steps.length; i++) {
    if (ctx.cancelled) {
      return {
        success: false,
        message: '建築がキャンセルされました',
        completedSteps,
        totalSteps: blueprint.steps.length,
      };
    }

    const step = blueprint.steps[i];
    ctx.onProgress?.(`ステップ ${i + 1}/${blueprint.steps.length}: ${step.action} ${step.comment ?? ''}`);

    const result = await executeBuildStep(ctx, step, i);
    
    if (!result.success) {
      console.warn(`[build-tricks] Step ${i + 1} failed: ${result.message}`);
    }
    
    completedSteps++;
    await sleep(200);
  }

  const limitations = blueprint.limitations ?? [];
  if (limitations.length > 0) {
    ctx.onProgress?.(`注意事項: ${limitations[0]}`);
  }

  return {
    success: true,
    message: `${blueprint.nameJa}の建築が完了しました！`,
    completedSteps,
    totalSteps: blueprint.steps.length,
  };
}

function findBestTool(bot: Bot, block: MineflayerBlock): ReturnType<typeof bot.inventory.items>[number] | null {
  const items = bot.inventory.items();
  
  const toolPriority = [
    'netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe',
    'netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel',
    'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe',
  ];

  for (const toolName of toolPriority) {
    const tool = items.find(item => item.name === toolName);
    if (tool) return tool;
  }

  return null;
}

function findItemInInventory(
  bot: Bot, 
  itemName: string
): ReturnType<typeof bot.inventory.items>[number] | null {
  const items = bot.inventory.items();
  
  const exactMatch = items.find(item => item.name === itemName);
  if (exactMatch) return exactMatch;

  const partialMatch = items.find(item => 
    item.name.includes(itemName) || itemName.includes(item.name)
  );
  
  return partialMatch ?? null;
}

function findPlacementReference(bot: Bot, position: Vec3): MineflayerBlock | null {
  const offsets = [
    [0, -1, 0], [0, 0, -1], [0, 0, 1],
    [-1, 0, 0], [1, 0, 0], [0, 1, 0]
  ] as const;

  for (const [x, y, z] of offsets) {
    const block = bot.blockAt(position.offset(x, y, z));
    if (block?.boundingBox === 'block') return block;
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
