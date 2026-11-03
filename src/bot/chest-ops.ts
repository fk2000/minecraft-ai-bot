import type { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import pathfinderPlugin from 'mineflayer-pathfinder';

const { goals: { GoalNear } } = pathfinderPlugin;

export interface ChestMoveResult {
  requested: number;
  moved: number;
  itemName: string;
}

async function gotoChest(bot: Bot, x: number, y: number, z: number): Promise<void> {
  await bot.pathfinder.goto(new GoalNear(x, y, z, 2));
}

function findInventoryItem(bot: Bot, itemQuery: string) {
  const normalized = itemQuery.toLowerCase().replace(/\s+/g, '_');
  return bot.inventory.items().find((candidate) =>
    candidate.name.toLowerCase() === normalized ||
    candidate.name.toLowerCase().includes(normalized) ||
    candidate.displayName?.toLowerCase().includes(itemQuery.toLowerCase())
  );
}

export async function chestTake(
  bot: Bot,
  itemQuery: string,
  count: number,
  x: number,
  y: number,
  z: number
): Promise<ChestMoveResult> {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('count must be a positive integer');
  }

  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block) throw new Error(`no block at ${x} ${y} ${z}`);
  await gotoChest(bot, x, y, z);
  const container = await bot.openContainer(block);
  try {
    const template = findInventoryItem(bot, itemQuery) ??
      container.containerItems().find((candidate) =>
        candidate.name.toLowerCase().includes(itemQuery.toLowerCase().replace(/\s+/g, '_'))
      );
    if (!template) {
      return { requested: count, moved: 0, itemName: itemQuery };
    }
    const before = bot.inventory.count(template.type, template.metadata);
    await container.withdraw(template.type, template.metadata, count);
    const after = bot.inventory.count(template.type, template.metadata);
    return {
      requested: count,
      moved: Math.max(0, after - before),
      itemName: template.name
    };
  } finally {
    await container.close();
  }
}

export async function chestPut(
  bot: Bot,
  x: number,
  y: number,
  z: number
): Promise<{ deposits: ChestMoveResult[]; totalMoved: number }> {
  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block) throw new Error(`no block at ${x} ${y} ${z}`);
  await gotoChest(bot, x, y, z);
  const container = await bot.openContainer(block);
  const deposits: ChestMoveResult[] = [];
  let totalMoved = 0;
  try {
    const items = [...bot.inventory.items()];
    for (const item of items) {
      const before = container.containerItems()
        .filter((stack) => stack.type === item.type && stack.metadata === item.metadata)
        .reduce((sum, stack) => sum + stack.count, 0);
      await container.deposit(item.type, item.metadata, item.count);
      const after = container.containerItems()
        .filter((stack) => stack.type === item.type && stack.metadata === item.metadata)
        .reduce((sum, stack) => sum + stack.count, 0);
      const moved = Math.max(0, after - before);
      totalMoved += moved;
      deposits.push({ requested: item.count, moved, itemName: item.name });
    }
    return { deposits, totalMoved };
  } finally {
    await container.close();
  }
}
