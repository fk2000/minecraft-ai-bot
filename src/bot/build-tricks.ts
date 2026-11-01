/**
 * Build Tricks Module
 * Implements 5 building tricks from the YouTube Short 「マイクラの天才だけが知ってる建築の裏技5選」
 * 
 * Material Policy:
 * - Natural items: gathered from world (dig, chop, collect)
 * - Crafted items: requested via chat, wait for player to provide
 */

import type { Bot } from 'mineflayer';
import type { Block as MineflayerBlock } from 'prismarine-block';
import type { Vec3 } from 'vec3';

export type MaterialSource = 'natural' | 'crafted';

export interface MaterialRequirement {
  item: string;
  displayName: string;
  count: number;
  source: MaterialSource;
  alternatives?: string[];
}

export interface BuildStep {
  action: 'dig' | 'place' | 'spawn_entity' | 'use_item' | 'wait' | 'remove';
  block?: string;
  entity?: string;
  position: { x: number; y: number; z: number };
  face?: 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
  comment?: string;
}

export interface TrickBlueprint {
  id: string;
  name: string;
  nameJa: string;
  description: string;
  materials: MaterialRequirement[];
  steps: BuildStep[];
  size: { width: number; height: number; depth: number };
  limitations?: string[];
}

export const NATURAL_ITEMS = new Set([
  'stone', 'cobblestone', 'dirt', 'grass_block', 'sand', 'gravel',
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
  'snow', 'snow_block', 'powder_snow',
  'deepslate', 'cobbled_deepslate',
  'redstone_ore', 'deepslate_redstone_ore',
  'gold_ore', 'deepslate_gold_ore',
  'coarse_dirt', 'rooted_dirt', 'podzol',
  'rose_bush', 'peony', 'sunflower', 'lilac',
  'chicken',
]);

export const CRAFTED_ITEMS = new Set([
  'lead', 'spruce_fence', 'oak_fence', 'birch_fence',
  'stone_bricks', 'mossy_stone_bricks',
  'brown_candle', 'lantern', 'soul_lantern',
  'moss_carpet', 'red_carpet', 'brown_carpet', 'green_carpet',
  'ochre_froglight', 'verdant_froglight', 'pearlescent_froglight',
  'yellow_banner', 'white_banner',
  'smooth_sandstone', 'white_concrete', 'black_concrete',
  'deepslate_tiles', 'deepslate_tile_wall', 'deepslate_tile_slab',
  'anvil', 'cauldron', 'chain',
  'quartz_bricks', 'quartz_block',
  'oak_trapdoor', 'spruce_trapdoor', 'birch_trapdoor',
]);

export function getMaterialSource(itemName: string): MaterialSource {
  const normalized = itemName.toLowerCase().replace(/ /g, '_');
  if (NATURAL_ITEMS.has(normalized)) return 'natural';
  return 'crafted';
}

export const TRICK_BLUEPRINTS: TrickBlueprint[] = [
  {
    id: 'trick1',
    name: 'String Lights',
    nameJa: 'イルミネーション',
    description: 'Festive string lights with chickens, leads, candles and lanterns drooping between two pillars',
    materials: [
      { item: 'stone_bricks', displayName: '石レンガ', count: 24, source: 'crafted' },
      { item: 'mossy_stone_bricks', displayName: '苔むした石レンガ', count: 12, source: 'crafted' },
      { item: 'spruce_fence', displayName: 'トウヒのフェンス', count: 2, source: 'crafted' },
      { item: 'lead', displayName: 'リード', count: 2, source: 'crafted' },
      { item: 'brown_candle', displayName: '茶色のろうそく', count: 6, source: 'crafted' },
      { item: 'lantern', displayName: 'ランタン', count: 6, source: 'crafted' },
      { item: 'chicken', displayName: 'ニワトリ', count: 2, source: 'natural', alternatives: ['chicken_spawn_egg'] },
    ],
    steps: [
      { action: 'place', block: 'stone_bricks', position: { x: 0, y: 0, z: 0 }, comment: 'Left pillar base' },
      { action: 'place', block: 'stone_bricks', position: { x: 0, y: 1, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 0, y: 2, z: 0 } },
      { action: 'place', block: 'mossy_stone_bricks', position: { x: 0, y: 3, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 0, y: 4, z: 0 } },
      { action: 'dig', position: { x: 0, y: 4, z: 0 }, comment: 'Create hole for chicken' },
      { action: 'spawn_entity', entity: 'chicken', position: { x: 0, y: 4, z: 0 } },
      { action: 'use_item', block: 'lead', position: { x: 0, y: 4, z: 0 }, comment: 'Attach lead to chicken' },
      { action: 'place', block: 'spruce_fence', position: { x: 0, y: 5, z: 0 }, comment: 'Fence to trap chicken' },
      { action: 'place', block: 'stone_bricks', position: { x: 7, y: 0, z: 0 }, comment: 'Right pillar base' },
      { action: 'place', block: 'stone_bricks', position: { x: 7, y: 1, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 7, y: 2, z: 0 } },
      { action: 'place', block: 'mossy_stone_bricks', position: { x: 7, y: 3, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 7, y: 4, z: 0 } },
      { action: 'dig', position: { x: 7, y: 4, z: 0 }, comment: 'Create hole for chicken' },
      { action: 'spawn_entity', entity: 'chicken', position: { x: 7, y: 4, z: 0 } },
      { action: 'use_item', block: 'lead', position: { x: 7, y: 4, z: 0 }, comment: 'Attach lead to chicken' },
      { action: 'place', block: 'spruce_fence', position: { x: 7, y: 5, z: 0 }, comment: 'Fence to trap chicken' },
      { action: 'place', block: 'stone_bricks', position: { x: 1, y: 5, z: 0 }, comment: 'Temporary bridge' },
      { action: 'place', block: 'stone_bricks', position: { x: 2, y: 5, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 3, y: 5, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 4, y: 5, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 5, y: 5, z: 0 } },
      { action: 'place', block: 'stone_bricks', position: { x: 6, y: 5, z: 0 } },
      { action: 'place', block: 'brown_candle', position: { x: 1, y: 6, z: 0 }, comment: 'Candles on bridge' },
      { action: 'place', block: 'brown_candle', position: { x: 3, y: 6, z: 0 } },
      { action: 'place', block: 'brown_candle', position: { x: 5, y: 6, z: 0 } },
      { action: 'place', block: 'lantern', position: { x: 2, y: 4, z: 0 }, face: 'bottom', comment: 'Hanging lanterns' },
      { action: 'place', block: 'lantern', position: { x: 4, y: 4, z: 0 }, face: 'bottom' },
      { action: 'place', block: 'lantern', position: { x: 6, y: 4, z: 0 }, face: 'bottom' },
      { action: 'remove', position: { x: 1, y: 5, z: 0 }, comment: 'Remove temporary bridge' },
      { action: 'remove', position: { x: 2, y: 5, z: 0 } },
      { action: 'remove', position: { x: 3, y: 5, z: 0 } },
      { action: 'remove', position: { x: 4, y: 5, z: 0 } },
      { action: 'remove', position: { x: 5, y: 5, z: 0 } },
      { action: 'remove', position: { x: 6, y: 5, z: 0 } },
    ],
    size: { width: 8, height: 7, depth: 1 },
    limitations: [
      'ニワトリの捕獲・リード接続はベストエフォート（手動での補助が必要な場合あり）',
      'リードの垂れ下がりは2匹のニワトリが両方の柱にいる必要あり',
    ],
  },
  {
    id: 'trick2',
    name: 'Leafy Base Tall Flowers',
    nameJa: '葉っぱベース花',
    description: 'Creative plant arrangement with snow layers and moss carpet for unique tall flower appearance',
    materials: [
      { item: 'snow', displayName: '雪（レイヤー）', count: 4, source: 'natural' },
      { item: 'moss_carpet', displayName: '苔カーペット', count: 1, source: 'crafted' },
      { item: 'rose_bush', displayName: 'バラの低木', count: 1, source: 'natural', alternatives: ['peony', 'sunflower', 'lilac'] },
    ],
    steps: [
      { action: 'dig', position: { x: 0, y: 0, z: 0 }, comment: 'Dig 1 block into ground' },
      { action: 'place', block: 'snow', position: { x: 0, y: 0, z: 0 }, comment: 'Stack snow layers in hole' },
      { action: 'place', block: 'moss_carpet', position: { x: 0, y: 1, z: 0 }, comment: 'Moss carpet on top' },
      { action: 'place', block: 'rose_bush', position: { x: 0, y: 1, z: 0 }, comment: 'Plant tall flower into arrangement' },
    ],
    size: { width: 1, height: 3, depth: 1 },
    limitations: [
      '地面がdirt/grass_blockである必要あり',
      '2ブロック高さの花（rose_bush, peony, sunflower, lilac）を使用',
    ],
  },
  {
    id: 'trick3',
    name: 'Glowing Windows & Textured Roof',
    nameJa: '光る窓と質感のある屋根',
    description: 'House with froglight windows using banners and textured roof with carpet pattern',
    materials: [
      { item: 'smooth_sandstone', displayName: '滑らかな砂岩', count: 20, source: 'crafted' },
      { item: 'ochre_froglight', displayName: '黄土色のフロッグライト', count: 4, source: 'crafted' },
      { item: 'yellow_banner', displayName: '黄色の旗', count: 4, source: 'crafted' },
      { item: 'snow_block', displayName: '雪ブロック', count: 16, source: 'natural' },
      { item: 'brown_carpet', displayName: '茶色のカーペット', count: 8, source: 'crafted' },
    ],
    steps: [
      { action: 'place', block: 'smooth_sandstone', position: { x: 0, y: 0, z: 0 }, comment: 'Wall base' },
      { action: 'place', block: 'smooth_sandstone', position: { x: 1, y: 0, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 2, y: 0, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 3, y: 0, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 0, y: 1, z: 0 } },
      { action: 'place', block: 'ochre_froglight', position: { x: 1, y: 1, z: 0 }, comment: 'Window with froglight' },
      { action: 'place', block: 'ochre_froglight', position: { x: 2, y: 1, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 3, y: 1, z: 0 } },
      { action: 'place', block: 'yellow_banner', position: { x: 1, y: 1, z: -1 }, face: 'south', comment: 'Banner as window pane' },
      { action: 'place', block: 'yellow_banner', position: { x: 2, y: 1, z: -1 }, face: 'south' },
      { action: 'place', block: 'smooth_sandstone', position: { x: 0, y: 2, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 1, y: 2, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 2, y: 2, z: 0 } },
      { action: 'place', block: 'smooth_sandstone', position: { x: 3, y: 2, z: 0 } },
      { action: 'place', block: 'snow_block', position: { x: 0, y: 3, z: 0 }, comment: 'Roof base' },
      { action: 'place', block: 'snow_block', position: { x: 1, y: 3, z: 0 } },
      { action: 'place', block: 'snow_block', position: { x: 2, y: 3, z: 0 } },
      { action: 'place', block: 'snow_block', position: { x: 3, y: 3, z: 0 } },
      { action: 'place', block: 'brown_carpet', position: { x: 0, y: 4, z: 0 }, comment: 'Carpet texture on roof' },
      { action: 'place', block: 'brown_carpet', position: { x: 2, y: 4, z: 0 } },
      { action: 'place', block: 'snow_block', position: { x: 1, y: 4, z: 0 }, comment: 'Second roof layer' },
      { action: 'place', block: 'snow_block', position: { x: 2, y: 4, z: 0 } },
      { action: 'place', block: 'brown_carpet', position: { x: 1, y: 5, z: 0 } },
    ],
    size: { width: 4, height: 6, depth: 2 },
    limitations: [
      'バナーの向きはface設定で調整（建築方向により手動調整が必要）',
      'フロッグライトは比較的レアアイテム（要リクエスト）',
    ],
  },
  {
    id: 'trick4',
    name: 'Elegant Archway',
    nameJa: 'エレガントアーチ',
    description: 'Decorative arch with deepslate tiles, walls, anvils and cauldrons',
    materials: [
      { item: 'deepslate_tiles', displayName: '深層岩タイル', count: 8, source: 'crafted' },
      { item: 'deepslate_tile_wall', displayName: '深層岩タイルの塀', count: 4, source: 'crafted' },
      { item: 'anvil', displayName: '金床', count: 4, source: 'crafted' },
      { item: 'cauldron', displayName: '大釜', count: 2, source: 'crafted' },
      { item: 'quartz_bricks', displayName: 'クォーツレンガ', count: 12, source: 'crafted' },
    ],
    steps: [
      { action: 'place', block: 'quartz_bricks', position: { x: -1, y: 0, z: 0 }, comment: 'Background' },
      { action: 'place', block: 'quartz_bricks', position: { x: 0, y: 0, z: 0 } },
      { action: 'place', block: 'quartz_bricks', position: { x: 1, y: 0, z: 0 } },
      { action: 'place', block: 'quartz_bricks', position: { x: 2, y: 0, z: 0 } },
      { action: 'place', block: 'quartz_bricks', position: { x: 3, y: 0, z: 0 } },
      { action: 'place', block: 'quartz_bricks', position: { x: 4, y: 0, z: 0 } },
      { action: 'place', block: 'deepslate_tiles', position: { x: 0, y: 1, z: -1 }, comment: 'Left pillar base' },
      { action: 'place', block: 'deepslate_tile_wall', position: { x: 0, y: 2, z: -1 } },
      { action: 'place', block: 'anvil', position: { x: 0, y: 3, z: -1 }, comment: 'Anvil on pillar' },
      { action: 'place', block: 'deepslate_tiles', position: { x: 2, y: 1, z: -1 }, comment: 'Middle pillar' },
      { action: 'place', block: 'deepslate_tile_wall', position: { x: 2, y: 2, z: -1 } },
      { action: 'place', block: 'anvil', position: { x: 2, y: 3, z: -1 } },
      { action: 'place', block: 'deepslate_tiles', position: { x: 4, y: 1, z: -1 }, comment: 'Right pillar' },
      { action: 'place', block: 'deepslate_tile_wall', position: { x: 4, y: 2, z: -1 } },
      { action: 'place', block: 'anvil', position: { x: 4, y: 3, z: -1 } },
      { action: 'place', block: 'deepslate_tiles', position: { x: 1, y: 4, z: -1 }, comment: 'Connecting arch' },
      { action: 'place', block: 'cauldron', position: { x: 1, y: 3, z: -1 }, comment: 'Cauldron between anvils' },
      { action: 'place', block: 'deepslate_tiles', position: { x: 3, y: 4, z: -1 } },
      { action: 'place', block: 'cauldron', position: { x: 3, y: 3, z: -1 } },
    ],
    size: { width: 6, height: 5, depth: 2 },
    limitations: [
      '金床の向きはプレイヤーの位置に依存',
      'すべてのアイテムがクラフト品のためリクエスト必須',
    ],
  },
  {
    id: 'trick5',
    name: 'Glowing Red Path',
    nameJa: '光る赤い道',
    description: 'Pathway with redstone ore under red carpet that glows when walked on',
    materials: [
      { item: 'redstone_ore', displayName: 'レッドストーン鉱石', count: 10, source: 'natural' },
      { item: 'red_carpet', displayName: '赤いカーペット', count: 10, source: 'crafted' },
      { item: 'black_concrete', displayName: '黒コンクリート', count: 20, source: 'crafted' },
      { item: 'coarse_dirt', displayName: '粗い土', count: 20, source: 'natural', alternatives: ['rooted_dirt'] },
    ],
    steps: [
      { action: 'place', block: 'coarse_dirt', position: { x: -1, y: 0, z: 0 }, comment: 'Outer edge left' },
      { action: 'place', block: 'coarse_dirt', position: { x: -1, y: 0, z: 1 } },
      { action: 'place', block: 'coarse_dirt', position: { x: -1, y: 0, z: 2 } },
      { action: 'place', block: 'coarse_dirt', position: { x: -1, y: 0, z: 3 } },
      { action: 'place', block: 'coarse_dirt', position: { x: -1, y: 0, z: 4 } },
      { action: 'place', block: 'black_concrete', position: { x: 0, y: 0, z: 0 }, comment: 'Border left' },
      { action: 'place', block: 'black_concrete', position: { x: 0, y: 0, z: 1 } },
      { action: 'place', block: 'black_concrete', position: { x: 0, y: 0, z: 2 } },
      { action: 'place', block: 'black_concrete', position: { x: 0, y: 0, z: 3 } },
      { action: 'place', block: 'black_concrete', position: { x: 0, y: 0, z: 4 } },
      { action: 'dig', position: { x: 1, y: 0, z: 0 }, comment: 'Dig path for redstone ore' },
      { action: 'dig', position: { x: 1, y: 0, z: 1 } },
      { action: 'dig', position: { x: 1, y: 0, z: 2 } },
      { action: 'dig', position: { x: 1, y: 0, z: 3 } },
      { action: 'dig', position: { x: 1, y: 0, z: 4 } },
      { action: 'dig', position: { x: 2, y: 0, z: 0 } },
      { action: 'dig', position: { x: 2, y: 0, z: 1 } },
      { action: 'dig', position: { x: 2, y: 0, z: 2 } },
      { action: 'dig', position: { x: 2, y: 0, z: 3 } },
      { action: 'dig', position: { x: 2, y: 0, z: 4 } },
      { action: 'place', block: 'redstone_ore', position: { x: 1, y: 0, z: 0 }, comment: 'Place redstone ore in path' },
      { action: 'place', block: 'redstone_ore', position: { x: 1, y: 0, z: 1 } },
      { action: 'place', block: 'redstone_ore', position: { x: 1, y: 0, z: 2 } },
      { action: 'place', block: 'redstone_ore', position: { x: 1, y: 0, z: 3 } },
      { action: 'place', block: 'redstone_ore', position: { x: 1, y: 0, z: 4 } },
      { action: 'place', block: 'redstone_ore', position: { x: 2, y: 0, z: 0 } },
      { action: 'place', block: 'redstone_ore', position: { x: 2, y: 0, z: 1 } },
      { action: 'place', block: 'redstone_ore', position: { x: 2, y: 0, z: 2 } },
      { action: 'place', block: 'redstone_ore', position: { x: 2, y: 0, z: 3 } },
      { action: 'place', block: 'redstone_ore', position: { x: 2, y: 0, z: 4 } },
      { action: 'place', block: 'red_carpet', position: { x: 1, y: 1, z: 0 }, comment: 'Cover with carpet' },
      { action: 'place', block: 'red_carpet', position: { x: 1, y: 1, z: 1 } },
      { action: 'place', block: 'red_carpet', position: { x: 1, y: 1, z: 2 } },
      { action: 'place', block: 'red_carpet', position: { x: 1, y: 1, z: 3 } },
      { action: 'place', block: 'red_carpet', position: { x: 1, y: 1, z: 4 } },
      { action: 'place', block: 'red_carpet', position: { x: 2, y: 1, z: 0 } },
      { action: 'place', block: 'red_carpet', position: { x: 2, y: 1, z: 1 } },
      { action: 'place', block: 'red_carpet', position: { x: 2, y: 1, z: 2 } },
      { action: 'place', block: 'red_carpet', position: { x: 2, y: 1, z: 3 } },
      { action: 'place', block: 'red_carpet', position: { x: 2, y: 1, z: 4 } },
      { action: 'place', block: 'black_concrete', position: { x: 3, y: 0, z: 0 }, comment: 'Border right' },
      { action: 'place', block: 'black_concrete', position: { x: 3, y: 0, z: 1 } },
      { action: 'place', block: 'black_concrete', position: { x: 3, y: 0, z: 2 } },
      { action: 'place', block: 'black_concrete', position: { x: 3, y: 0, z: 3 } },
      { action: 'place', block: 'black_concrete', position: { x: 3, y: 0, z: 4 } },
      { action: 'place', block: 'coarse_dirt', position: { x: 4, y: 0, z: 0 }, comment: 'Outer edge right' },
      { action: 'place', block: 'coarse_dirt', position: { x: 4, y: 0, z: 1 } },
      { action: 'place', block: 'coarse_dirt', position: { x: 4, y: 0, z: 2 } },
      { action: 'place', block: 'coarse_dirt', position: { x: 4, y: 0, z: 3 } },
      { action: 'place', block: 'coarse_dirt', position: { x: 4, y: 0, z: 4 } },
    ],
    size: { width: 6, height: 2, depth: 5 },
    limitations: [
      'レッドストーン鉱石はSilk Touchツルハシで採掘が必要（通常採掘ではドロップ）',
      '踏むと光るエフェクトが発動',
    ],
  },
];

export const TRICK_ALIASES: Record<string, string> = {
  'trick1': 'trick1',
  'トリック1': 'trick1',
  'イルミ': 'trick1',
  'イルミネーション': 'trick1',
  '電飾': 'trick1',
  'stringlights': 'trick1',
  
  'trick2': 'trick2',
  'トリック2': 'trick2',
  '花': 'trick2',
  '植物': 'trick2',
  '葉っぱ花': 'trick2',
  'flower': 'trick2',
  
  'trick3': 'trick3',
  'トリック3': 'trick3',
  '窓': 'trick3',
  '屋根': 'trick3',
  'window': 'trick3',
  
  'trick4': 'trick4',
  'トリック4': 'trick4',
  'アーチ': 'trick4',
  '門': 'trick4',
  'arch': 'trick4',
  
  'trick5': 'trick5',
  'トリック5': 'trick5',
  '道': 'trick5',
  '光る道': 'trick5',
  'path': 'trick5',
  'redpath': 'trick5',
};

export function parseTrickId(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  return TRICK_ALIASES[normalized] ?? null;
}

export function getTrickById(id: string): TrickBlueprint | null {
  return TRICK_BLUEPRINTS.find(t => t.id === id) ?? null;
}

export function listTricksHelp(): string {
  return TRICK_BLUEPRINTS.map(t => 
    `  ${t.id} (${t.nameJa}): ${t.description.slice(0, 40)}...`
  ).join('\n');
}

export interface MaterialCheckResult {
  ready: boolean;
  missing: Array<{ item: string; displayName: string; needed: number; have: number; source: MaterialSource }>;
  available: Array<{ item: string; count: number }>;
}

export function checkMaterials(
  blueprint: TrickBlueprint,
  inventoryItems: Array<{ name: string; count: number }>
): MaterialCheckResult {
  const inventory = new Map<string, number>();
  for (const item of inventoryItems) {
    inventory.set(item.name, (inventory.get(item.name) ?? 0) + item.count);
  }

  const missing: MaterialCheckResult['missing'] = [];
  const available: MaterialCheckResult['available'] = [];

  for (const req of blueprint.materials) {
    let have = inventory.get(req.item) ?? 0;
    
    if (req.alternatives) {
      for (const alt of req.alternatives) {
        have += inventory.get(alt) ?? 0;
      }
    }

    if (have >= req.count) {
      available.push({ item: req.item, count: have });
    } else {
      missing.push({
        item: req.item,
        displayName: req.displayName,
        needed: req.count,
        have,
        source: req.source,
      });
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    available,
  };
}

export function formatMaterialRequest(missing: MaterialCheckResult['missing']): string {
  const craftedMissing = missing.filter(m => m.source === 'crafted');
  
  if (craftedMissing.length === 0) {
    return '';
  }

  const items = craftedMissing.map(m => 
    `${m.displayName}を${m.needed - m.have}個`
  ).join('、');

  return `${items}ください（建築用）`;
}

export function formatNaturalGatherList(missing: MaterialCheckResult['missing']): string {
  const naturalMissing = missing.filter(m => m.source === 'natural');
  
  if (naturalMissing.length === 0) {
    return '';
  }

  return naturalMissing.map(m => 
    `${m.displayName}: あと${m.needed - m.have}個必要（採集予定）`
  ).join('\n');
}

export interface GatherableBlock {
  name: string;
  position: Vec3;
}

export async function findGatherableBlocks(
  bot: Bot,
  itemName: string,
  count: number,
  maxDistance: number = 32
): Promise<GatherableBlock[]> {
  const results: GatherableBlock[] = [];
  
  const blockPatterns: Record<string, RegExp> = {
    'stone': /^stone$/,
    'cobblestone': /^cobblestone$/,
    'dirt': /^(dirt|grass_block)$/,
    'snow': /^(snow|snow_block|powder_snow)$/,
    'snow_block': /^snow_block$/,
    'deepslate': /^(deepslate|cobbled_deepslate)$/,
    'redstone_ore': /^(redstone_ore|deepslate_redstone_ore)$/,
    'coarse_dirt': /^coarse_dirt$/,
    'rooted_dirt': /^rooted_dirt$/,
    'rose_bush': /^rose_bush$/,
    'peony': /^peony$/,
    'sunflower': /^sunflower$/,
    'lilac': /^lilac$/,
  };

  const pattern = blockPatterns[itemName];
  if (!pattern) return results;

  const blocks = bot.findBlocks({
    matching: (block: MineflayerBlock) => pattern.test(block.name),
    maxDistance,
    count: count * 2,
  });

  for (const pos of blocks) {
    if (results.length >= count) break;
    const block = bot.blockAt(pos);
    if (block) {
      results.push({ name: block.name, position: pos });
    }
  }

  return results;
}

export interface BuildContext {
  bot: Bot;
  origin: Vec3;
  blueprint: TrickBlueprint;
  cancelled: boolean;
  onProgress?: (step: number, total: number, message: string) => void;
  onChatRequest?: (message: string) => void;
}

export function offsetPosition(origin: Vec3, offset: { x: number; y: number; z: number }): Vec3 {
  return origin.offset(offset.x, offset.y, offset.z);
}
