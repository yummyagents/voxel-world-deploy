import * as THREE from 'three';
import { SimplexNoise } from './noise.js?v=20260922a';

/* ============================================
   常量
   ============================================ */
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const RENDER_DISTANCE = 4;
const MOBILE_RENDER_DISTANCE = 4;
export const SEA_LEVEL = 24;
export const TEXT_GROUND_Y = 20;
export const TEXT_BASE_Y = 21;

/* ============================================
   方块类型定义 (uint8, 0-255)
   ============================================ */
export const BlockType = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  WATER: 7,
  COZE_CYAN: 8,
  // === 新增方块 ===
  SNOW_GRASS: 9,      // 雪草地（顶面雪，侧面草+雪）
  SNOW: 10,           // 纯雪块
  ICE: 11,
  CACTUS: 12,
  COBBLESTONE: 13,
  PLANKS: 14,
  GLASS: 15,
  COAL_ORE: 16,
  IRON_ORE: 17,
  GOLD_ORE: 18,
  DIAMOND_ORE: 19,
  SANDSTONE: 20,
  GRAVEL: 21,
  BIRCH_WOOD: 22,
  BIRCH_LEAVES: 23,
  JUNGLE_WOOD: 24,
  JUNGLE_LEAVES: 25,
  BRICK: 26,
  PUMPKIN: 27,
  // === 植物（十字形渲染） ===
  TALL_GRASS: 28,
  FLOWER_RED: 29,
  FLOWER_YELLOW: 30,
  FLOWER_WHITE: 31,
  MUSHROOM_RED: 32,
  MUSHROOM_BROWN: 33,
  DEAD_BUSH: 34,
  // === 扩展：更多木材/建材/装饰 ===
  CHERRY_WOOD: 35,       // 樱木（粉棕色树干）
  CHERRY_LEAVES: 36,     // 粉色樱花叶
  SPRUCE_WOOD: 37,
  SPRUCE_LEAVES: 38,
  ACACIA_WOOD: 39,
  ACACIA_LEAVES: 40,
  DARK_OAK_WOOD: 41,
  DARK_OAK_LEAVES: 42,
  GRANITE: 43,
  DIORITE: 44,
  ANDESITE: 45,
  MOSSY_COBBLE: 46,
  OBSIDIAN: 47,
  BEDROCK: 48,
  CLAY: 49,
  BOOKSHELF: 50,
  CRAFTING_TABLE: 51,
  FURNACE: 52,
  LAPIS_ORE: 53,
  REDSTONE_ORE: 54,
  EMERALD_ORE: 55,
  GLOWSTONE: 56,
  NETHERRACK: 57,
  SOUL_SAND: 58,
  END_STONE: 59,
  PURPUR: 60,
  TERRACOTTA: 61,
  PACKED_ICE: 62,
  PODZOL: 63,
  RED_SAND: 64,
  RED_SANDSTONE: 65,
  PRISMARINE: 66,
  SEA_LANTERN: 67,
  BONE_BLOCK: 68,
  HAY_BLOCK: 69,
  MELON: 70,
  // === 家具/生活用品（兑换获得） ===
  BED_RED: 71,          // 床
  CHEST: 72,            // 箱子
  LADDER: 73,           // 梯子
  DOOR: 74,             // 木门
  LANTERN: 75,          // 灯笼
  PAINTING: 76,         // 画
  FLOWER_POT: 77,       // 花盆
  BED_BLUE: 78,         // 蓝床
  BED_GREEN: 79,        // 绿床
  BED_YELLOW: 80,       // 黄床
  TABLE_WOOD: 81,       // 木桌
  CHAIR_WOOD: 82,       // 木椅
  SOFA_RED: 83,         // 红沙发
  CLOCK_BLOCK: 84,      // 钟
  TORCH: 85,            // 火把（十字形）
  FENCE: 86,            // 木围栏
  // 注意：Uint8 最大 255，还有扩展空间
};

/** 方块名称 */
export const BlockNames = {
  [BlockType.GRASS]: '草地',
  [BlockType.DIRT]: '泥土',
  [BlockType.STONE]: '石头',
  [BlockType.SAND]: '沙子',
  [BlockType.WOOD]: '橡木',
  [BlockType.LEAVES]: '树叶',
  [BlockType.WATER]: '水',
  [BlockType.COZE_CYAN]: 'Coze粉',
  [BlockType.SNOW_GRASS]: '雪草地',
  [BlockType.SNOW]: '雪',
  [BlockType.ICE]: '冰',
  [BlockType.CACTUS]: '仙人掌',
  [BlockType.COBBLESTONE]: '圆石',
  [BlockType.PLANKS]: '木板',
  [BlockType.GLASS]: '玻璃',
  [BlockType.COAL_ORE]: '煤矿石',
  [BlockType.IRON_ORE]: '铁矿石',
  [BlockType.GOLD_ORE]: '金矿石',
  [BlockType.DIAMOND_ORE]: '钻石矿石',
  [BlockType.SANDSTONE]: '砂岩',
  [BlockType.GRAVEL]: '沙砾',
  [BlockType.BIRCH_WOOD]: '白桦木',
  [BlockType.BIRCH_LEAVES]: '白桦叶',
  [BlockType.JUNGLE_WOOD]: '丛林木',
  [BlockType.JUNGLE_LEAVES]: '丛林叶',
  [BlockType.BRICK]: '砖块',
  [BlockType.PUMPKIN]: '南瓜',
  [BlockType.TALL_GRASS]: '草',
  [BlockType.FLOWER_RED]: '红花',
  [BlockType.FLOWER_YELLOW]: '黄花',
  [BlockType.FLOWER_WHITE]: '白花',
  [BlockType.MUSHROOM_RED]: '红蘑菇',
  [BlockType.MUSHROOM_BROWN]: '棕蘑菇',
  [BlockType.DEAD_BUSH]: '枯灌木',
  [BlockType.CHERRY_WOOD]: '樱木',
  [BlockType.CHERRY_LEAVES]: '樱花叶',
  [BlockType.SPRUCE_WOOD]: '云杉木',
  [BlockType.SPRUCE_LEAVES]: '云杉叶',
  [BlockType.ACACIA_WOOD]: '金合欢木',
  [BlockType.ACACIA_LEAVES]: '金合欢叶',
  [BlockType.DARK_OAK_WOOD]: '深色橡木',
  [BlockType.DARK_OAK_LEAVES]: '深色橡叶',
  [BlockType.GRANITE]: '花岗岩',
  [BlockType.DIORITE]: '闪长岩',
  [BlockType.ANDESITE]: '安山岩',
  [BlockType.MOSSY_COBBLE]: '苔石',
  [BlockType.OBSIDIAN]: '黑曜石',
  [BlockType.BEDROCK]: '基岩',
  [BlockType.CLAY]: '粘土',
  [BlockType.BOOKSHELF]: '书架',
  [BlockType.CRAFTING_TABLE]: '工作台',
  [BlockType.FURNACE]: '熔炉',
  [BlockType.LAPIS_ORE]: '青金石矿',
  [BlockType.REDSTONE_ORE]: '红石矿',
  [BlockType.EMERALD_ORE]: '绿宝石矿',
  [BlockType.GLOWSTONE]: '荧石',
  [BlockType.NETHERRACK]: '地狱岩',
  [BlockType.SOUL_SAND]: '灵魂沙',
  [BlockType.END_STONE]: '末地石',
  [BlockType.PURPUR]: '紫珀块',
  [BlockType.TERRACOTTA]: '陶瓦',
  [BlockType.PACKED_ICE]: '浮冰',
  [BlockType.PODZOL]: '灰化土',
  [BlockType.RED_SAND]: '红沙',
  [BlockType.RED_SANDSTONE]: '红砂岩',
  [BlockType.PRISMARINE]: '海晶石',
  [BlockType.SEA_LANTERN]: '海晶灯',
  [BlockType.BONE_BLOCK]: '骨块',
  [BlockType.HAY_BLOCK]: '干草块',
  [BlockType.MELON]: '西瓜',
  [BlockType.BED_RED]: '红床',
  [BlockType.BED_BLUE]: '蓝床',
  [BlockType.BED_GREEN]: '绿床',
  [BlockType.BED_YELLOW]: '黄床',
  [BlockType.CHEST]: '箱子',
  [BlockType.LADDER]: '梯子',
  [BlockType.DOOR]: '木门',
  [BlockType.LANTERN]: '灯笼',
  [BlockType.PAINTING]: '画',
  [BlockType.FLOWER_POT]: '花盆',
  [BlockType.TABLE_WOOD]: '木桌',
  [BlockType.CHAIR_WOOD]: '木椅',
  [BlockType.SOFA_RED]: '红沙发',
  [BlockType.CLOCK_BLOCK]: '钟',
  [BlockType.TORCH]: '火把',
  [BlockType.FENCE]: '木围栏',
};

/** 判断方块是否固体（有碰撞） */
export function isSolid(type) {
  return type !== BlockType.AIR && type !== BlockType.WATER
    && type !== BlockType.TALL_GRASS && type !== BlockType.FLOWER_RED
    && type !== BlockType.FLOWER_YELLOW && type !== BlockType.FLOWER_WHITE
    && type !== BlockType.MUSHROOM_RED && type !== BlockType.MUSHROOM_BROWN
    && type !== BlockType.DEAD_BUSH && type !== BlockType.TORCH
    && type !== BlockType.LADDER;
}

/** 判断方块是否液体 */
export function isLiquid(type) {
  return type === BlockType.WATER;
}

/** 判断方块是否透明（不遮挡相邻面） */
export function isTransparent(type) {
  return type === BlockType.AIR || type === BlockType.WATER || type === BlockType.GLASS
    || type === BlockType.LEAVES || type === BlockType.BIRCH_LEAVES
    || type === BlockType.JUNGLE_LEAVES || type === BlockType.CHERRY_LEAVES
    || type === BlockType.SPRUCE_LEAVES || type === BlockType.ACACIA_LEAVES
    || type === BlockType.DARK_OAK_LEAVES
    || type === BlockType.TALL_GRASS || type === BlockType.FLOWER_RED
    || type === BlockType.FLOWER_YELLOW || type === BlockType.FLOWER_WHITE
    || type === BlockType.MUSHROOM_RED || type === BlockType.MUSHROOM_BROWN
    || type === BlockType.DEAD_BUSH || type === BlockType.ICE
    || type === BlockType.PACKED_ICE || type === BlockType.SEA_LANTERN
    || type === BlockType.TORCH || type === BlockType.LADDER
    || type === BlockType.LANTERN || type === BlockType.GLOWSTONE
    || type === BlockType.PAINTING || type === BlockType.FLOWER_POT;
}

/** 判断是否十字形植物 */
export function isCrossBlock(type) {
  return type === BlockType.TALL_GRASS || type === BlockType.FLOWER_RED
    || type === BlockType.FLOWER_YELLOW || type === BlockType.FLOWER_WHITE
    || type === BlockType.MUSHROOM_RED || type === BlockType.MUSHROOM_BROWN
    || type === BlockType.DEAD_BUSH || type === BlockType.TORCH;
}

/** 破坏方块的掉落物映射 */
export function getBlockDrop(type) {
  switch (type) {
    case BlockType.GRASS: return BlockType.DIRT;
    case BlockType.STONE: return BlockType.COBBLESTONE;
    case BlockType.COAL_ORE: return BlockType.COAL_ORE;
    case BlockType.IRON_ORE: return BlockType.IRON_ORE;
    case BlockType.GOLD_ORE: return BlockType.GOLD_ORE;
    case BlockType.DIAMOND_ORE: return BlockType.DIAMOND_ORE;
    case BlockType.LEAVES: return BlockType.AIR; // 树叶不掉落
    case BlockType.BIRCH_LEAVES: return BlockType.AIR;
    case BlockType.JUNGLE_LEAVES: return BlockType.AIR;
    case BlockType.CHERRY_LEAVES: return BlockType.AIR;
    case BlockType.SPRUCE_LEAVES: return BlockType.AIR;
    case BlockType.ACACIA_LEAVES: return BlockType.AIR;
    case BlockType.DARK_OAK_LEAVES: return BlockType.AIR;
    case BlockType.WATER: return BlockType.AIR;
    case BlockType.TALL_GRASS: return BlockType.AIR;
    case BlockType.FLOWER_RED:
    case BlockType.FLOWER_YELLOW:
    case BlockType.FLOWER_WHITE:
    case BlockType.MUSHROOM_RED:
    case BlockType.MUSHROOM_BROWN:
      return type;
    case BlockType.DEAD_BUSH: return BlockType.AIR;
    case BlockType.GLOWSTONE: return BlockType.GLOWSTONE;
    case BlockType.SEA_LANTERN: return BlockType.SEA_LANTERN;
    case BlockType.LAPIS_ORE: return BlockType.LAPIS_ORE;
    case BlockType.REDSTONE_ORE: return BlockType.REDSTONE_ORE;
    case BlockType.EMERALD_ORE: return BlockType.EMERALD_ORE;
    case BlockType.BEDROCK: return BlockType.BEDROCK;
    default: return type;
  }
}

/* ============================================
   纹理图集 (16列 × 8行 = 128槽位)
   ============================================ */
export const TEX_SIZE = 16;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 8;
const ATLAS_W = ATLAS_COLS * TEX_SIZE;
const ATLAS_H = ATLAS_ROWS * TEX_SIZE;

const TEX = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3,
  SAND: 4, WOOD_SIDE: 5, WOOD_TOP: 6, LEAVES: 7,
  WATER: 8, COZE: 9,
  SNOW_GRASS_TOP: 10, SNOW_GRASS_SIDE: 11, SNOW: 12, ICE: 13,
  CACTUS_SIDE: 14, CACTUS_TOP: 15,
  COBBLESTONE: 16, PLANKS: 17, GLASS: 18,
  COAL_ORE: 19, IRON_ORE: 20, GOLD_ORE: 21, DIAMOND_ORE: 22,
  SANDSTONE_TOP: 23, SANDSTONE_SIDE: 24, GRAVEL: 25,
  BIRCH_WOOD_SIDE: 26, BIRCH_WOOD_TOP: 27, BIRCH_LEAVES: 28,
  JUNGLE_WOOD_SIDE: 29, JUNGLE_WOOD_TOP: 30, JUNGLE_LEAVES: 31,
  BRICK: 32, PUMPKIN_SIDE: 33, PUMPKIN_TOP: 34, PUMPKIN_FRONT: 35,
  TALL_GRASS: 36, FLOWER_RED: 37, FLOWER_YELLOW: 38, FLOWER_WHITE: 39,
  MUSHROOM_RED: 40, MUSHROOM_BROWN: 41, DEAD_BUSH: 42,
  // 扩展纹理
  CHERRY_WOOD_SIDE: 48, CHERRY_WOOD_TOP: 49, CHERRY_LEAVES: 50,
  SPRUCE_WOOD_SIDE: 51, SPRUCE_WOOD_TOP: 52, SPRUCE_LEAVES: 53,
  ACACIA_WOOD_SIDE: 54, ACACIA_WOOD_TOP: 55, ACACIA_LEAVES: 56,
  DARK_OAK_WOOD_SIDE: 57, DARK_OAK_WOOD_TOP: 58, DARK_OAK_LEAVES: 59,
  GRANITE: 60, DIORITE: 61, ANDESITE: 62, MOSSY_COBBLE: 63,
  OBSIDIAN: 64, BEDROCK: 65, CLAY: 66, BOOKSHELF: 67,
  CRAFTING_TOP: 68, CRAFTING_SIDE: 69, FURNACE_FRONT: 70, FURNACE_SIDE: 71,
  LAPIS_ORE: 72, REDSTONE_ORE: 73, EMERALD_ORE: 74, GLOWSTONE: 75,
  NETHERRACK: 76, SOUL_SAND: 77, END_STONE: 78, PURPUR: 79,
  TERRACOTTA: 80, PACKED_ICE: 81, PODZOL_TOP: 82, PODZOL_SIDE: 83,
  RED_SAND: 84, RED_SANDSTONE_TOP: 85, RED_SANDSTONE_SIDE: 86,
  PRISMARINE: 87, SEA_LANTERN: 88, BONE_BLOCK: 89, HAY_BLOCK: 90,
  MELON_SIDE: 91, MELON_TOP: 92,
  // 家具/生活用品
  BED_RED: 93, BED_BLUE: 94, BED_GREEN: 95, BED_YELLOW: 96,
  CHEST: 97, LADDER: 98, DOOR: 99, LANTERN: 100,
  PAINTING: 101, FLOWER_POT: 102, TABLE_WOOD: 103, CHAIR_WOOD: 104,
  SOFA_RED: 105, CLOCK_BLOCK: 106, TORCH: 107, FENCE: 108,
};

/** 方块纹理映射 { top, bottom, side } 或 'cross' */
export const BLOCK_TEXTURES = {
  [BlockType.GRASS]: { top: TEX.GRASS_TOP, bottom: TEX.DIRT, side: TEX.GRASS_SIDE },
  [BlockType.DIRT]: { top: TEX.DIRT, bottom: TEX.DIRT, side: TEX.DIRT },
  [BlockType.STONE]: { top: TEX.STONE, bottom: TEX.STONE, side: TEX.STONE },
  [BlockType.SAND]: { top: TEX.SAND, bottom: TEX.SAND, side: TEX.SAND },
  [BlockType.WOOD]: { top: TEX.WOOD_TOP, bottom: TEX.WOOD_TOP, side: TEX.WOOD_SIDE },
  [BlockType.LEAVES]: { top: TEX.LEAVES, bottom: TEX.LEAVES, side: TEX.LEAVES },
  [BlockType.WATER]: { top: TEX.WATER, bottom: TEX.WATER, side: TEX.WATER },
  [BlockType.COZE_CYAN]: { top: TEX.COZE, bottom: TEX.COZE, side: TEX.COZE },
  [BlockType.SNOW_GRASS]: { top: TEX.SNOW_GRASS_TOP, bottom: TEX.DIRT, side: TEX.SNOW_GRASS_SIDE },
  [BlockType.SNOW]: { top: TEX.SNOW, bottom: TEX.SNOW, side: TEX.SNOW },
  [BlockType.ICE]: { top: TEX.ICE, bottom: TEX.ICE, side: TEX.ICE },
  [BlockType.CACTUS]: { top: TEX.CACTUS_TOP, bottom: TEX.CACTUS_TOP, side: TEX.CACTUS_SIDE },
  [BlockType.COBBLESTONE]: { top: TEX.COBBLESTONE, bottom: TEX.COBBLESTONE, side: TEX.COBBLESTONE },
  [BlockType.PLANKS]: { top: TEX.PLANKS, bottom: TEX.PLANKS, side: TEX.PLANKS },
  [BlockType.GLASS]: { top: TEX.GLASS, bottom: TEX.GLASS, side: TEX.GLASS },
  [BlockType.COAL_ORE]: { top: TEX.COAL_ORE, bottom: TEX.COAL_ORE, side: TEX.COAL_ORE },
  [BlockType.IRON_ORE]: { top: TEX.IRON_ORE, bottom: TEX.IRON_ORE, side: TEX.IRON_ORE },
  [BlockType.GOLD_ORE]: { top: TEX.GOLD_ORE, bottom: TEX.GOLD_ORE, side: TEX.GOLD_ORE },
  [BlockType.DIAMOND_ORE]: { top: TEX.DIAMOND_ORE, bottom: TEX.DIAMOND_ORE, side: TEX.DIAMOND_ORE },
  [BlockType.SANDSTONE]: { top: TEX.SANDSTONE_TOP, bottom: TEX.SANDSTONE_TOP, side: TEX.SANDSTONE_SIDE },
  [BlockType.GRAVEL]: { top: TEX.GRAVEL, bottom: TEX.GRAVEL, side: TEX.GRAVEL },
  [BlockType.BIRCH_WOOD]: { top: TEX.BIRCH_WOOD_TOP, bottom: TEX.BIRCH_WOOD_TOP, side: TEX.BIRCH_WOOD_SIDE },
  [BlockType.BIRCH_LEAVES]: { top: TEX.BIRCH_LEAVES, bottom: TEX.BIRCH_LEAVES, side: TEX.BIRCH_LEAVES },
  [BlockType.JUNGLE_WOOD]: { top: TEX.JUNGLE_WOOD_TOP, bottom: TEX.JUNGLE_WOOD_TOP, side: TEX.JUNGLE_WOOD_SIDE },
  [BlockType.JUNGLE_LEAVES]: { top: TEX.JUNGLE_LEAVES, bottom: TEX.JUNGLE_LEAVES, side: TEX.JUNGLE_LEAVES },
  [BlockType.BRICK]: { top: TEX.BRICK, bottom: TEX.BRICK, side: TEX.BRICK },
  [BlockType.PUMPKIN]: { top: TEX.PUMPKIN_TOP, bottom: TEX.PUMPKIN_TOP, side: TEX.PUMPKIN_SIDE },
  [BlockType.TALL_GRASS]: 'cross',
  [BlockType.FLOWER_RED]: 'cross',
  [BlockType.FLOWER_YELLOW]: 'cross',
  [BlockType.FLOWER_WHITE]: 'cross',
  [BlockType.MUSHROOM_RED]: 'cross',
  [BlockType.MUSHROOM_BROWN]: 'cross',
  [BlockType.DEAD_BUSH]: 'cross',
  [BlockType.CHERRY_WOOD]: { top: TEX.CHERRY_WOOD_TOP, bottom: TEX.CHERRY_WOOD_TOP, side: TEX.CHERRY_WOOD_SIDE },
  [BlockType.CHERRY_LEAVES]: { top: TEX.CHERRY_LEAVES, bottom: TEX.CHERRY_LEAVES, side: TEX.CHERRY_LEAVES },
  [BlockType.SPRUCE_WOOD]: { top: TEX.SPRUCE_WOOD_TOP, bottom: TEX.SPRUCE_WOOD_TOP, side: TEX.SPRUCE_WOOD_SIDE },
  [BlockType.SPRUCE_LEAVES]: { top: TEX.SPRUCE_LEAVES, bottom: TEX.SPRUCE_LEAVES, side: TEX.SPRUCE_LEAVES },
  [BlockType.ACACIA_WOOD]: { top: TEX.ACACIA_WOOD_TOP, bottom: TEX.ACACIA_WOOD_TOP, side: TEX.ACACIA_WOOD_SIDE },
  [BlockType.ACACIA_LEAVES]: { top: TEX.ACACIA_LEAVES, bottom: TEX.ACACIA_LEAVES, side: TEX.ACACIA_LEAVES },
  [BlockType.DARK_OAK_WOOD]: { top: TEX.DARK_OAK_WOOD_TOP, bottom: TEX.DARK_OAK_WOOD_TOP, side: TEX.DARK_OAK_WOOD_SIDE },
  [BlockType.DARK_OAK_LEAVES]: { top: TEX.DARK_OAK_LEAVES, bottom: TEX.DARK_OAK_LEAVES, side: TEX.DARK_OAK_LEAVES },
  [BlockType.GRANITE]: { top: TEX.GRANITE, bottom: TEX.GRANITE, side: TEX.GRANITE },
  [BlockType.DIORITE]: { top: TEX.DIORITE, bottom: TEX.DIORITE, side: TEX.DIORITE },
  [BlockType.ANDESITE]: { top: TEX.ANDESITE, bottom: TEX.ANDESITE, side: TEX.ANDESITE },
  [BlockType.MOSSY_COBBLE]: { top: TEX.MOSSY_COBBLE, bottom: TEX.MOSSY_COBBLE, side: TEX.MOSSY_COBBLE },
  [BlockType.OBSIDIAN]: { top: TEX.OBSIDIAN, bottom: TEX.OBSIDIAN, side: TEX.OBSIDIAN },
  [BlockType.BEDROCK]: { top: TEX.BEDROCK, bottom: TEX.BEDROCK, side: TEX.BEDROCK },
  [BlockType.CLAY]: { top: TEX.CLAY, bottom: TEX.CLAY, side: TEX.CLAY },
  [BlockType.BOOKSHELF]: { top: TEX.PLANKS, bottom: TEX.PLANKS, side: TEX.BOOKSHELF },
  [BlockType.CRAFTING_TABLE]: { top: TEX.CRAFTING_TOP, bottom: TEX.PLANKS, side: TEX.CRAFTING_SIDE },
  [BlockType.FURNACE]: { top: TEX.FURNACE_SIDE, bottom: TEX.FURNACE_SIDE, side: TEX.FURNACE_SIDE, front: TEX.FURNACE_FRONT },
  [BlockType.LAPIS_ORE]: { top: TEX.LAPIS_ORE, bottom: TEX.LAPIS_ORE, side: TEX.LAPIS_ORE },
  [BlockType.REDSTONE_ORE]: { top: TEX.REDSTONE_ORE, bottom: TEX.REDSTONE_ORE, side: TEX.REDSTONE_ORE },
  [BlockType.EMERALD_ORE]: { top: TEX.EMERALD_ORE, bottom: TEX.EMERALD_ORE, side: TEX.EMERALD_ORE },
  [BlockType.GLOWSTONE]: { top: TEX.GLOWSTONE, bottom: TEX.GLOWSTONE, side: TEX.GLOWSTONE },
  [BlockType.NETHERRACK]: { top: TEX.NETHERRACK, bottom: TEX.NETHERRACK, side: TEX.NETHERRACK },
  [BlockType.SOUL_SAND]: { top: TEX.SOUL_SAND, bottom: TEX.SOUL_SAND, side: TEX.SOUL_SAND },
  [BlockType.END_STONE]: { top: TEX.END_STONE, bottom: TEX.END_STONE, side: TEX.END_STONE },
  [BlockType.PURPUR]: { top: TEX.PURPUR, bottom: TEX.PURPUR, side: TEX.PURPUR },
  [BlockType.TERRACOTTA]: { top: TEX.TERRACOTTA, bottom: TEX.TERRACOTTA, side: TEX.TERRACOTTA },
  [BlockType.PACKED_ICE]: { top: TEX.PACKED_ICE, bottom: TEX.PACKED_ICE, side: TEX.PACKED_ICE },
  [BlockType.PODZOL]: { top: TEX.PODZOL_TOP, bottom: TEX.DIRT, side: TEX.PODZOL_SIDE },
  [BlockType.RED_SAND]: { top: TEX.RED_SAND, bottom: TEX.RED_SAND, side: TEX.RED_SAND },
  [BlockType.RED_SANDSTONE]: { top: TEX.RED_SANDSTONE_TOP, bottom: TEX.RED_SANDSTONE_TOP, side: TEX.RED_SANDSTONE_SIDE },
  [BlockType.PRISMARINE]: { top: TEX.PRISMARINE, bottom: TEX.PRISMARINE, side: TEX.PRISMARINE },
  [BlockType.SEA_LANTERN]: { top: TEX.SEA_LANTERN, bottom: TEX.SEA_LANTERN, side: TEX.SEA_LANTERN },
  [BlockType.BONE_BLOCK]: { top: TEX.BONE_BLOCK, bottom: TEX.BONE_BLOCK, side: TEX.BONE_BLOCK },
  [BlockType.HAY_BLOCK]: { top: TEX.HAY_BLOCK, bottom: TEX.HAY_BLOCK, side: TEX.HAY_BLOCK },
  [BlockType.MELON]: { top: TEX.MELON_TOP, bottom: TEX.MELON_TOP, side: TEX.MELON_SIDE },
  // 家具/生活用品
  [BlockType.BED_RED]: { top: TEX.BED_RED, bottom: TEX.PLANKS, side: TEX.BED_RED },
  [BlockType.BED_BLUE]: { top: TEX.BED_BLUE, bottom: TEX.PLANKS, side: TEX.BED_BLUE },
  [BlockType.BED_GREEN]: { top: TEX.BED_GREEN, bottom: TEX.PLANKS, side: TEX.BED_GREEN },
  [BlockType.BED_YELLOW]: { top: TEX.BED_YELLOW, bottom: TEX.PLANKS, side: TEX.BED_YELLOW },
  [BlockType.CHEST]: { top: TEX.CHEST, bottom: TEX.PLANKS, side: TEX.CHEST },
  [BlockType.LADDER]: { top: TEX.LADDER, bottom: TEX.LADDER, side: TEX.LADDER },
  [BlockType.DOOR]: { top: TEX.DOOR, bottom: TEX.DOOR, side: TEX.DOOR },
  [BlockType.LANTERN]: { top: TEX.LANTERN, bottom: TEX.LANTERN, side: TEX.LANTERN },
  [BlockType.PAINTING]: { top: TEX.PAINTING, bottom: TEX.PAINTING, side: TEX.PAINTING },
  [BlockType.FLOWER_POT]: { top: TEX.FLOWER_POT, bottom: TEX.FLOWER_POT, side: TEX.FLOWER_POT },
  [BlockType.TABLE_WOOD]: { top: TEX.TABLE_WOOD, bottom: TEX.PLANKS, side: TEX.TABLE_WOOD },
  [BlockType.CHAIR_WOOD]: { top: TEX.CHAIR_WOOD, bottom: TEX.PLANKS, side: TEX.CHAIR_WOOD },
  [BlockType.SOFA_RED]: { top: TEX.SOFA_RED, bottom: TEX.SOFA_RED, side: TEX.SOFA_RED },
  [BlockType.CLOCK_BLOCK]: { top: TEX.CLOCK_BLOCK, bottom: TEX.PLANKS, side: TEX.CLOCK_BLOCK },
  [BlockType.TORCH]: 'cross',
};

/* ============================================
   纹理绘制工具
   ============================================ */
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xff) / 255;
}

function drawTexture(ctx, index, drawFn) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  ctx.save();
  ctx.translate(col * TEX_SIZE, row * TEX_SIZE);
  drawFn(ctx);
  ctx.restore();
}

function fillNoisy(ctx, r, g, b, amt = 20) {
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const n = (hash(px, py) - 0.5) * amt;
      const rr = Math.max(0, Math.min(255, r + n)) | 0;
      const gg = Math.max(0, Math.min(255, g + n)) | 0;
      const bb = Math.max(0, Math.min(255, b + n)) | 0;
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

/** 在石头底色上绘制矿石斑点 */
function drawOre(ctx, oreR, oreG, oreB, count = 6) {
  fillNoisy(ctx, 128, 128, 128, 25);
  for (let i = 0; i < count; i++) {
    const sx = (hash(i * 3 + 1, i * 7) * 12 + 2) | 0;
    const sy = (hash(i * 5 + 3, i * 11) * 12 + 2) | 0;
    ctx.fillStyle = `rgb(${oreR},${oreG},${oreB})`;
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillRect(sx + 1, sy - 1, 1, 1);
    ctx.fillRect(sx - 1, sy + 1, 1, 1);
    ctx.fillStyle = `rgb(${(oreR * 0.7) | 0},${(oreG * 0.7) | 0},${(oreB * 0.7) | 0})`;
    ctx.fillRect(sx + 2, sy + 1, 1, 1);
  }
}

function createAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 0 草地顶
  drawTexture(ctx, TEX.GRASS_TOP, c => fillNoisy(c, 90, 160, 50, 30));
  // 1 草地侧
  drawTexture(ctx, TEX.GRASS_SIDE, c => {
    fillNoisy(c, 134, 96, 67, 20);
    for (let py = 0; py < 4; py++)
      for (let px = 0; px < TEX_SIZE; px++) {
        const n = (hash(px + 100, py + 100) - 0.5) * 30;
        c.fillStyle = `rgb(${(70+n/2)|0},${(140+n)|0},${(40+n/3)|0})`;
        c.fillRect(px, py, 1, 1);
      }
  });
  // 2 泥土
  drawTexture(ctx, TEX.DIRT, c => fillNoisy(c, 134, 96, 67, 25));
  // 3 石头
  drawTexture(ctx, TEX.STONE, c => {
    fillNoisy(c, 128, 128, 128, 25);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(80,80,80,0.6)';
      c.fillRect((hash(i, 42) * 14) | 0, (hash(i, 73) * 14) | 0, 2, 1);
    }
  });
  // 4 沙子
  drawTexture(ctx, TEX.SAND, c => fillNoisy(c, 220, 200, 130, 20));
  // 5 橡木侧
  drawTexture(ctx, TEX.WOOD_SIDE, c => {
    fillNoisy(c, 120, 80, 50, 15);
    for (let px = 0; px < TEX_SIZE; px++)
      if (hash(px, 999) > 0.6)
        for (let py = 0; py < TEX_SIZE; py++) {
          c.fillStyle = 'rgba(80,55,30,0.4)';
          c.fillRect(px, py, 1, 1);
        }
  });
  // 6 橡木顶
  drawTexture(ctx, TEX.WOOD_TOP, c => {
    fillNoisy(c, 160, 120, 70, 15);
    for (let py = 0; py < TEX_SIZE; py++)
      for (let px = 0; px < TEX_SIZE; px++) {
        const d = Math.sqrt((px - 8) ** 2 + (py - 8) ** 2);
        if ((d | 0) % 3 === 0) { c.fillStyle = 'rgba(90,60,30,0.5)'; c.fillRect(px, py, 1, 1); }
      }
  });
  // 7 树叶
  drawTexture(ctx, TEX.LEAVES, c => {
    for (let py = 0; py < TEX_SIZE; py++)
      for (let px = 0; px < TEX_SIZE; px++) {
        const n = hash(px + 50, py + 50);
        if (n > 0.15) {
          c.fillStyle = `rgb(${(30+n*20)|0},${(100+(hash(px,py)*40)|0)|0},${(30+n*10)|0})`;
          c.fillRect(px, py, 1, 1);
        }
      }
  });
  // 8 水
  drawTexture(ctx, TEX.WATER, c => {
    fillNoisy(c, 50, 130, 220, 15);
    for (let py = 2; py < TEX_SIZE; py += 4)
      for (let px = 0; px < TEX_SIZE; px++) {
        const off = ((hash(py, px + 200) * 3) | 0) - 1;
        c.fillStyle = 'rgba(80,170,255,0.4)';
        c.fillRect(px + off, py, 1, 1);
      }
  });
  // 9 Coze粉
  drawTexture(ctx, TEX.COZE, c => fillNoisy(c, 244, 107, 149, 10));

  // 10 雪草地顶
  drawTexture(ctx, TEX.SNOW_GRASS_TOP, c => fillNoisy(c, 240, 245, 250, 8));
  // 11 雪草地侧
  drawTexture(ctx, TEX.SNOW_GRASS_SIDE, c => {
    fillNoisy(c, 134, 96, 67, 20);
    for (let py = 0; py < 5; py++)
      for (let px = 0; px < TEX_SIZE; px++) {
        c.fillStyle = `rgb(${235+(hash(px,py)*15)|0},${240+(hash(px,py)*12)|0},${248+(hash(px,py)*7)|0})`;
        c.fillRect(px, py, 1, 1);
      }
    // 草尖探出雪
    for (let px = 0; px < TEX_SIZE; px += 3) {
      c.fillStyle = '#5a9e32';
      c.fillRect(px, 4, 1, 2);
    }
  });
  // 12 雪
  drawTexture(ctx, TEX.SNOW, c => fillNoisy(c, 245, 248, 252, 6));
  // 13 冰
  drawTexture(ctx, TEX.ICE, c => {
    fillNoisy(c, 160, 200, 240, 12);
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.beginPath();
      c.moveTo(hash(i, 1) * 16, hash(i, 2) * 16);
      c.lineTo(hash(i, 3) * 16, hash(i, 4) * 16);
      c.stroke();
    }
  });
  // 14 仙人掌侧
  drawTexture(ctx, TEX.CACTUS_SIDE, c => {
    fillNoisy(c, 80, 140, 60, 15);
    // 侧边脊线
    c.fillStyle = 'rgba(50,100,30,0.5)';
    c.fillRect(1, 0, 1, 16);
    c.fillRect(14, 0, 1, 16);
    // 刺
    for (let py = 2; py < 16; py += 4) {
      c.fillStyle = '#f0e8c0';
      c.fillRect(7, py, 1, 1);
    }
  });
  // 15 仙人掌顶
  drawTexture(ctx, TEX.CACTUS_TOP, c => {
    fillNoisy(c, 90, 150, 70, 12);
    c.fillStyle = 'rgba(50,100,30,0.4)';
    c.fillRect(5, 5, 6, 6);
  });
  // 16 圆石
  drawTexture(ctx, TEX.COBBLESTONE, c => {
    fillNoisy(c, 110, 110, 110, 30);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = 'rgba(60,60,60,0.5)';
      c.fillRect((hash(i, 20) * 13) | 0, (hash(i, 30) * 13) | 0, 3, 2);
    }
  });
  // 17 木板
  drawTexture(ctx, TEX.PLANKS, c => {
    fillNoisy(c, 180, 140, 80, 15);
    c.fillStyle = 'rgba(120,85,40,0.4)';
    for (let py = 0; py < 16; py += 4) c.fillRect(0, py, 16, 1);
  });
  // 18 玻璃
  drawTexture(ctx, TEX.GLASS, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = 'rgba(200,230,255,0.25)';
    c.fillRect(0, 0, 16, 16);
    c.strokeStyle = 'rgba(220,240,255,0.8)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, 15, 15);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(2, 2, 3, 1);
    c.fillRect(2, 2, 1, 5);
  });
  // 19 煤矿
  drawTexture(ctx, TEX.COAL_ORE, c => drawOre(c, 30, 30, 30, 8));
  // 20 铁矿
  drawTexture(ctx, TEX.IRON_ORE, c => drawOre(c, 200, 170, 130, 7));
  // 21 金矿
  drawTexture(ctx, TEX.GOLD_ORE, c => drawOre(c, 240, 210, 60, 6));
  // 22 钻石矿
  drawTexture(ctx, TEX.DIAMOND_ORE, c => drawOre(c, 100, 230, 230, 5));
  // 23 砂岩顶
  drawTexture(ctx, TEX.SANDSTONE_TOP, c => fillNoisy(c, 225, 210, 150, 12));
  // 24 砂岩侧
  drawTexture(ctx, TEX.SANDSTONE_SIDE, c => {
    fillNoisy(c, 218, 200, 140, 15);
    c.fillStyle = 'rgba(180,160,100,0.4)';
    c.fillRect(0, 3, 16, 1);
    c.fillRect(0, 12, 16, 1);
  });
  // 25 沙砾
  drawTexture(ctx, TEX.GRAVEL, c => {
    fillNoisy(c, 130, 125, 120, 30);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(${90+hash(i,1)*40|0},${85+hash(i,2)*40|0},${80+hash(i,3)*40|0},0.6)`;
      c.fillRect((hash(i, 4) * 14) | 0, (hash(i, 5) * 14) | 0, 2, 2);
    }
  });
  // 26 白桦木侧
  drawTexture(ctx, TEX.BIRCH_WOOD_SIDE, c => {
    fillNoisy(c, 220, 215, 200, 10);
    for (let py = 0; py < 16; py += 3)
      for (let px = 0; px < 16; px++)
        if (hash(px, py + 500) > 0.6) { c.fillStyle = 'rgba(60,50,40,0.5)'; c.fillRect(px, py, 1 + (hash(px,py)*2|0), 1); }
  });
  // 27 白桦木顶
  drawTexture(ctx, TEX.BIRCH_WOOD_TOP, c => {
    fillNoisy(c, 210, 200, 175, 12);
    for (let py = 0; py < 16; py++)
      for (let px = 0; px < 16; px++) {
        const d = Math.sqrt((px - 8) ** 2 + (py - 8) ** 2);
        if ((d | 0) % 3 === 0) { c.fillStyle = 'rgba(150,130,90,0.4)'; c.fillRect(px, py, 1, 1); }
      }
  });
  // 28 白桦叶
  drawTexture(ctx, TEX.BIRCH_LEAVES, c => {
    for (let py = 0; py < 16; py++)
      for (let px = 0; px < 16; px++) {
        const n = hash(px + 80, py + 80);
        if (n > 0.15) {
          c.fillStyle = `rgb(${(120+n*30)|0},${(170+(hash(px,py)*30)|0)|0},${(100+n*20)|0})`;
          c.fillRect(px, py, 1, 1);
        }
      }
  });
  // 29 丛林木侧
  drawTexture(ctx, TEX.JUNGLE_WOOD_SIDE, c => {
    fillNoisy(c, 90, 60, 35, 15);
    for (let px = 0; px < 16; px++)
      if (hash(px, 777) > 0.5)
        for (let py = 0; py < 16; py++) { c.fillStyle = 'rgba(60,35,15,0.4)'; c.fillRect(px, py, 1, 1); }
  });
  // 30 丛林木顶
  drawTexture(ctx, TEX.JUNGLE_WOOD_TOP, c => {
    fillNoisy(c, 130, 90, 50, 15);
    for (let py = 0; py < 16; py++)
      for (let px = 0; px < 16; px++) {
        const d = Math.sqrt((px - 8) ** 2 + (py - 8) ** 2);
        if ((d | 0) % 2 === 0) { c.fillStyle = 'rgba(70,45,20,0.5)'; c.fillRect(px, py, 1, 1); }
      }
  });
  // 31 丛林叶
  drawTexture(ctx, TEX.JUNGLE_LEAVES, c => {
    for (let py = 0; py < 16; py++)
      for (let px = 0; px < 16; px++) {
        const n = hash(px + 30, py + 30);
        if (n > 0.1) {
          c.fillStyle = `rgb(${(20+n*15)|0},${(90+(hash(px,py)*35)|0)|0},${(20+n*8)|0})`;
          c.fillRect(px, py, 1, 1);
        }
      }
  });
  // 32 砖块
  drawTexture(ctx, TEX.BRICK, c => {
    fillNoisy(c, 170, 80, 60, 12);
    c.fillStyle = 'rgba(200,200,190,0.7)';
    c.fillRect(0, 0, 16, 1);
    c.fillRect(0, 7, 16, 1);
    c.fillRect(0, 15, 16, 1);
    c.fillRect(7, 0, 1, 8);
    c.fillRect(3, 8, 1, 8);
    c.fillRect(11, 8, 1, 8);
  });
  // 33 南瓜侧
  drawTexture(ctx, TEX.PUMPKIN_SIDE, c => {
    fillNoisy(c, 220, 140, 30, 15);
    c.fillStyle = 'rgba(180,100,20,0.4)';
    for (let px = 2; px < 16; px += 4) c.fillRect(px, 0, 1, 16);
  });
  // 34 南瓜顶
  drawTexture(ctx, TEX.PUMPKIN_TOP, c => {
    fillNoisy(c, 200, 130, 30, 12);
    c.fillStyle = '#5a7a30';
    c.fillRect(6, 6, 4, 4);
  });
  // 35 南瓜脸
  drawTexture(ctx, TEX.PUMPKIN_FRONT, c => {
    fillNoisy(c, 220, 140, 30, 10);
    c.fillStyle = '#2a1a00';
    c.fillRect(3, 4, 2, 2); c.fillRect(11, 4, 2, 2);
    c.fillRect(4, 9, 1, 1); c.fillRect(6, 11, 1, 1); c.fillRect(8, 11, 1, 1); c.fillRect(10, 9, 1, 1);
    c.fillRect(5, 10, 1, 1); c.fillRect(9, 10, 1, 1); c.fillRect(7, 12, 2, 1);
  });
  // 36 高草
  drawTexture(ctx, TEX.TALL_GRASS, c => {
    c.clearRect(0, 0, 16, 16);
    for (let px = 2; px < 14; px += 2) {
      const h = 8 + (hash(px, 1) * 8) | 0;
      c.fillStyle = `rgb(${60+hash(px,2)*40|0},${130+hash(px,3)*50|0},${40+hash(px,4)*30|0})`;
      c.fillRect(px, 16 - h, 1, h);
    }
  });
  // 37 红花
  drawTexture(ctx, TEX.FLOWER_RED, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#3a7a20'; c.fillRect(7, 6, 1, 10);
    c.fillStyle = '#e03030';
    c.fillRect(6, 3, 4, 4); c.fillRect(5, 4, 1, 2); c.fillRect(10, 4, 1, 2); c.fillRect(7, 2, 2, 1); c.fillRect(7, 7, 2, 1);
    c.fillStyle = '#ffdd00'; c.fillRect(7, 4, 2, 2);
  });
  // 38 黄花
  drawTexture(ctx, TEX.FLOWER_YELLOW, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#3a7a20'; c.fillRect(7, 6, 1, 10);
    c.fillStyle = '#ffd020';
    c.fillRect(6, 3, 4, 4); c.fillRect(5, 4, 1, 2); c.fillRect(10, 4, 1, 2); c.fillRect(7, 2, 2, 1);
    c.fillStyle = '#e89010'; c.fillRect(7, 4, 2, 2);
  });
  // 39 白花
  drawTexture(ctx, TEX.FLOWER_WHITE, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#3a7a20'; c.fillRect(7, 6, 1, 10);
    c.fillStyle = '#f0f0f0';
    c.fillRect(6, 3, 4, 4); c.fillRect(5, 4, 1, 2); c.fillRect(10, 4, 1, 2); c.fillRect(7, 2, 2, 1);
    c.fillStyle = '#ffcc00'; c.fillRect(7, 4, 2, 2);
  });
  // 40 红蘑菇
  drawTexture(ctx, TEX.MUSHROOM_RED, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#e8d8b8'; c.fillRect(7, 9, 2, 5);
    c.fillStyle = '#d02020';
    c.fillRect(4, 5, 8, 4); c.fillRect(3, 6, 10, 3); c.fillRect(5, 4, 6, 1);
    c.fillStyle = '#ffffff';
    c.fillRect(5, 6, 1, 1); c.fillRect(9, 7, 1, 1); c.fillRect(7, 5, 1, 1);
  });
  // 41 棕蘑菇
  drawTexture(ctx, TEX.MUSHROOM_BROWN, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#d8c8a8'; c.fillRect(7, 9, 2, 5);
    c.fillStyle = '#8a5a30';
    c.fillRect(4, 5, 8, 4); c.fillRect(3, 6, 10, 3); c.fillRect(5, 4, 6, 1);
  });
  // 42 枯灌木
  drawTexture(ctx, TEX.DEAD_BUSH, c => {
    c.clearRect(0, 0, 16, 16);
    c.strokeStyle = '#8a6a40'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(8, 15); c.lineTo(8, 5);
    c.moveTo(8, 9); c.lineTo(4, 4); c.moveTo(8, 9); c.lineTo(12, 4);
    c.moveTo(8, 7); c.lineTo(5, 3); c.moveTo(8, 7); c.lineTo(11, 3);
    c.stroke();
  });

  // 43 樱花木顶
  drawTexture(ctx, TEX.CHERRY_WOOD_TOP, c => {
    fillNoisy(c, 216, 132, 132, 8);
    c.fillStyle = 'rgba(180,80,80,0.4)';
    for (let i = 0; i < 5; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 44 樱花木侧
  drawTexture(ctx, TEX.CHERRY_WOOD_SIDE, c => {
    fillNoisy(c, 156, 84, 84, 14);
    c.fillStyle = 'rgba(120,50,50,0.25)';
    for (let y = 0; y < 16; y += 3) c.fillRect(0, y, 16, 1);
  });
  // 45 樱花叶（粉色）
  drawTexture(ctx, TEX.CHERRY_LEAVES, c => {
    fillNoisy(c, 245, 190, 210, 30);
    c.fillStyle = 'rgba(255,220,230,0.5)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
    c.fillStyle = 'rgba(210,120,150,0.4)';
    for (let i = 0; i < 8; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 46 云杉木顶
  drawTexture(ctx, TEX.SPRUCE_WOOD_TOP, c => {
    fillNoisy(c, 110, 72, 40, 8);
  });
  // 47 云杉木侧
  drawTexture(ctx, TEX.SPRUCE_WOOD_SIDE, c => {
    fillNoisy(c, 78, 52, 30, 12);
    c.fillStyle = 'rgba(40,25,15,0.3)';
    for (let y = 0; y < 16; y += 4) c.fillRect(0, y, 16, 1);
  });
  // 48 云杉叶
  drawTexture(ctx, TEX.SPRUCE_LEAVES, c => {
    fillNoisy(c, 50, 90, 50, 20);
    c.fillStyle = 'rgba(30,60,30,0.4)';
    for (let i = 0; i < 16; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 49 金合欢木顶
  drawTexture(ctx, TEX.ACACIA_WOOD_TOP, c => {
    fillNoisy(c, 178, 110, 70, 8);
  });
  // 50 金合欢木侧
  drawTexture(ctx, TEX.ACACIA_WOOD_SIDE, c => {
    fillNoisy(c, 136, 82, 48, 12);
    c.fillStyle = 'rgba(80,45,25,0.3)';
    for (let y = 0; y < 16; y += 3) c.fillRect(0, y, 16, 1);
  });
  // 51 金合欢叶
  drawTexture(ctx, TEX.ACACIA_LEAVES, c => {
    fillNoisy(c, 150, 170, 70, 22);
    c.fillStyle = 'rgba(100,120,40,0.4)';
    for (let i = 0; i < 16; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 52 黑橡木顶
  drawTexture(ctx, TEX.DARK_OAK_WOOD_TOP, c => {
    fillNoisy(c, 60, 42, 24, 8);
  });
  // 53 黑橡木侧
  drawTexture(ctx, TEX.DARK_OAK_WOOD_SIDE, c => {
    fillNoisy(c, 48, 34, 20, 10);
    c.fillStyle = 'rgba(20,15,10,0.35)';
    for (let y = 0; y < 16; y += 3) c.fillRect(0, y, 16, 1);
  });
  // 54 黑橡叶
  drawTexture(ctx, TEX.DARK_OAK_LEAVES, c => {
    fillNoisy(c, 40, 75, 35, 20);
    c.fillStyle = 'rgba(20,40,20,0.45)';
    for (let i = 0; i < 16; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 55 花岗岩
  drawTexture(ctx, TEX.GRANITE, c => {
    fillNoisy(c, 140, 100, 90, 20);
    c.fillStyle = 'rgba(180,140,120,0.4)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*12|0, Math.random()*12|0, 3, 3);
  });
  // 56 闪长岩
  drawTexture(ctx, TEX.DIORITE, c => {
    fillNoisy(c, 200, 200, 200, 12);
    c.fillStyle = 'rgba(150,150,150,0.3)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*12|0, Math.random()*12|0, 3, 3);
  });
  // 57 安山岩
  drawTexture(ctx, TEX.ANDESITE, c => {
    fillNoisy(c, 135, 135, 135, 16);
    c.fillStyle = 'rgba(100,100,100,0.3)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*12|0, Math.random()*12|0, 3, 3);
  });
  // 58 苔石
  drawTexture(ctx, TEX.MOSSY_COBBLE, c => {
    fillNoisy(c, 115, 115, 115, 30);
    c.fillStyle = 'rgba(70,120,60,0.5)';
    for (let i = 0; i < 20; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 59 黑曜石
  drawTexture(ctx, TEX.OBSIDIAN, c => {
    fillNoisy(c, 25, 18, 38, 14);
    c.fillStyle = 'rgba(80,60,110,0.4)';
    for (let i = 0; i < 6; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 60 基岩
  drawTexture(ctx, TEX.BEDROCK, c => {
    fillNoisy(c, 70, 70, 75, 30);
    c.fillStyle = 'rgba(30,30,35,0.6)';
    for (let i = 0; i < 16; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 3, 3);
  });
  // 61 粘土
  drawTexture(ctx, TEX.CLAY, c => {
    fillNoisy(c, 165, 170, 180, 8);
  });
  // 62 书架侧
  drawTexture(ctx, TEX.BOOKSHELF, c => {
    c.fillStyle = '#c8a060'; c.fillRect(0, 0, 16, 16);
    const cols = ['#604020','#a05030','#306050','#704060','#a07030'];
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x += 3) {
        c.fillStyle = cols[(x+y)%cols.length|0];
        c.fillRect(x, y, 2, 3);
      }
    }
    c.fillStyle = '#8a6030'; c.fillRect(0, 0, 16, 2); c.fillRect(0, 14, 16, 2);
  });
  // 63 工作台顶
  drawTexture(ctx, TEX.CRAFTING_TOP, c => {
    fillNoisy(c, 170, 130, 80, 10);
    c.strokeStyle = '#5a3a18'; c.lineWidth = 1;
    c.strokeRect(1, 1, 14, 14); c.beginPath();
    c.moveTo(8, 1); c.lineTo(8, 15); c.moveTo(1, 8); c.lineTo(15, 8);
    c.stroke();
  });
  // 64 工作台侧
  drawTexture(ctx, TEX.CRAFTING_SIDE, c => {
    c.fillStyle = '#a07848'; c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#5a3a18'; c.fillRect(2, 2, 5, 4); c.fillRect(9, 2, 5, 4);
    c.fillStyle = '#8a6030'; c.fillRect(0, 8, 16, 8);
    c.fillStyle = '#6a4820'; for (let i = 0; i < 6; i++) c.fillRect(i*3, 10, 1, 4);
  });
  // 65 熔炉侧
  drawTexture(ctx, TEX.FURNACE_SIDE, c => {
    fillNoisy(c, 100, 100, 100, 16);
  });
  // 66 熔炉正面
  drawTexture(ctx, TEX.FURNACE_FRONT, c => {
    fillNoisy(c, 100, 100, 100, 16);
    c.fillStyle = '#303030'; c.fillRect(3, 4, 10, 9);
    c.fillStyle = '#1a1a1a'; c.fillRect(4, 5, 8, 7);
    c.fillStyle = '#ff8030'; c.fillRect(5, 9, 6, 3);
    c.fillStyle = '#ffc050'; c.fillRect(6, 10, 4, 2);
  });
  // 67 青金石矿
  drawTexture(ctx, TEX.LAPIS_ORE, c => {
    fillNoisy(c, 128, 128, 128, 20);
    c.fillStyle = '#2040a0';
    [[3,4],[9,3],[5,10],[11,11],[7,6]].forEach(([x,y]) => { c.fillRect(x, y, 2, 2); c.fillRect(x+1, y+1, 1, 1); });
    c.fillStyle = '#4060c0';
    [[4,5],[10,4],[6,11]].forEach(([x,y]) => c.fillRect(x, y, 1, 1));
  });
  // 68 红石矿
  drawTexture(ctx, TEX.REDSTONE_ORE, c => {
    fillNoisy(c, 128, 128, 128, 20);
    c.fillStyle = '#c02020';
    [[2,5],[8,3],[5,9],[11,8],[4,12],[10,12]].forEach(([x,y]) => { c.fillRect(x, y, 2, 2); c.fillRect(x+1, y+1, 1, 1); });
    c.fillStyle = '#ff4040';
    [[3,6],[9,4],[6,10]].forEach(([x,y]) => c.fillRect(x, y, 1, 1));
  });
  // 69 绿宝石矿
  drawTexture(ctx, TEX.EMERALD_ORE, c => {
    fillNoisy(c, 128, 128, 128, 20);
    c.fillStyle = '#20a060';
    [[4,3],[9,5],[5,10],[11,11]].forEach(([x,y]) => { c.fillRect(x, y, 2, 2); c.fillRect(x+1, y-1, 1, 1); });
    c.fillStyle = '#50e090';
    [[5,4],[10,6],[6,11]].forEach(([x,y]) => c.fillRect(x, y, 1, 1));
  });
  // 70 荧石
  drawTexture(ctx, TEX.GLOWSTONE, c => {
    fillNoisy(c, 200, 150, 70, 20);
    c.fillStyle = 'rgba(255,230,120,0.7)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 71 地狱岩
  drawTexture(ctx, TEX.NETHERRACK, c => {
    fillNoisy(c, 110, 40, 40, 22);
    c.fillStyle = 'rgba(70,20,20,0.5)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 3, 2);
  });
  // 72 灵魂沙
  drawTexture(ctx, TEX.SOUL_SAND, c => {
    fillNoisy(c, 80, 60, 45, 14);
    c.fillStyle = 'rgba(40,30,20,0.6)';
    [[3,4],[10,3],[6,9],[11,11],[4,12]].forEach(([x,y]) => { c.fillRect(x, y, 2, 1); c.fillRect(x+1, y+1, 1, 1); });
  });
  // 73 末地石
  drawTexture(ctx, TEX.END_STONE, c => {
    fillNoisy(c, 220, 215, 160, 14);
    c.fillStyle = 'rgba(180,175,130,0.5)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 74 紫珀块
  drawTexture(ctx, TEX.PURPUR, c => {
    fillNoisy(c, 170, 130, 180, 10);
    c.fillStyle = 'rgba(140,100,150,0.4)';
    for (let y = 0; y < 16; y += 4) c.fillRect(0, y, 16, 1);
  });
  // 75 陶瓦
  drawTexture(ctx, TEX.TERRACOTTA, c => {
    fillNoisy(c, 170, 110, 80, 16);
    c.fillStyle = 'rgba(130,80,55,0.4)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 3, 2);
  });
  // 76 浮冰
  drawTexture(ctx, TEX.PACKED_ICE, c => {
    fillNoisy(c, 140, 170, 210, 10);
    c.fillStyle = 'rgba(200,220,240,0.5)';
    for (let i = 0; i < 6; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 4, 1);
  });
  // 77 灰化土顶
  drawTexture(ctx, TEX.PODZOL_TOP, c => {
    fillNoisy(c, 110, 80, 45, 16);
    c.fillStyle = 'rgba(70,50,25,0.5)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 3, 3);
  });
  // 78 灰化土侧
  drawTexture(ctx, TEX.PODZOL_SIDE, c => {
    fillNoisy(c, 134, 96, 67, 12);
    c.fillStyle = '#7a5a30'; c.fillRect(0, 0, 16, 4);
    c.fillStyle = 'rgba(70,50,25,0.4)';
    for (let i = 0; i < 10; i++) c.fillRect(Math.random()*14|0, 1+Math.random()*3|0, 2, 2);
  });
  // 79 红沙
  drawTexture(ctx, TEX.RED_SAND, c => {
    fillNoisy(c, 190, 100, 60, 14);
  });
  // 80 红砂岩顶
  drawTexture(ctx, TEX.RED_SANDSTONE_TOP, c => {
    fillNoisy(c, 200, 115, 70, 10);
    c.fillStyle = 'rgba(170,90,50,0.4)';
    for (let y = 0; y < 16; y += 4) c.fillRect(0, y, 16, 1);
  });
  // 81 红砂岩侧
  drawTexture(ctx, TEX.RED_SANDSTONE_SIDE, c => {
    fillNoisy(c, 190, 105, 65, 10);
    c.fillStyle = 'rgba(160,80,45,0.5)';
    c.fillRect(0, 2, 16, 1); c.fillRect(0, 13, 16, 1);
    for (let i = 0; i < 6; i++) c.fillRect(2+i*3, 5, 1, 8);
  });
  // 82 海晶石
  drawTexture(ctx, TEX.PRISMARINE, c => {
    fillNoisy(c, 90, 150, 130, 16);
    c.fillStyle = 'rgba(60,110,100,0.5)';
    for (let i = 0; i < 12; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 3);
  });
  // 83 海晶灯
  drawTexture(ctx, TEX.SEA_LANTERN, c => {
    fillNoisy(c, 200, 220, 200, 10);
    c.fillStyle = 'rgba(255,255,240,0.7)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random()*14|0, Math.random()*14|0, 2, 2);
  });
  // 84 骨块
  drawTexture(ctx, TEX.BONE_BLOCK, c => {
    fillNoisy(c, 225, 220, 200, 8);
    c.fillStyle = 'rgba(190,185,165,0.6)';
    c.fillRect(2, 0, 2, 16); c.fillRect(12, 0, 2, 16);
  });
  // 85 干草块
  drawTexture(ctx, TEX.HAY_BLOCK, c => {
    fillNoisy(c, 200, 165, 60, 14);
    c.fillStyle = 'rgba(150,120,30,0.5)';
    for (let y = 0; y < 16; y += 2) c.fillRect(0, y, 16, 1);
  });
  // 86 西瓜顶
  drawTexture(ctx, TEX.MELON_TOP, c => {
    fillNoisy(c, 100, 160, 60, 16);
    c.strokeStyle = 'rgba(60,100,30,0.6)'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(8, 8); c.lineTo(Math.random()*16, Math.random()*16); c.stroke(); }
  });
  // 87 西瓜侧
  drawTexture(ctx, TEX.MELON_SIDE, c => {
    c.fillStyle = '#5a8a30'; c.fillRect(0, 0, 16, 16);
    fillNoisy(c, 90, 150, 55, 18);
    c.strokeStyle = 'rgba(40,80,25,0.6)'; c.lineWidth = 1;
    for (let x = 0; x < 16; x += 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x+1, 16); c.stroke(); }
  });

  /* ===== 家具/生活用品 ===== */
  const drawBed = (idx, r, g, b) => drawTexture(ctx, idx, c => {
    fillNoisy(c, 150, 110, 70, 12);                 // 木床板底
    c.fillStyle = '#7a5230'; c.fillRect(0, 0, 16, 3); // 床头板
    c.fillStyle = `rgb(${r},${g},${b})`;              // 床垫/枕头
    c.fillRect(2, 3, 12, 12);
    c.fillStyle = `rgb(${Math.min(r+40,255)|0},${Math.min(g+40,255)|0},${Math.min(b+40,255)|0})`;
    c.fillRect(3, 4, 5, 5);                           // 枕头高光
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
    c.strokeRect(2, 3, 12, 12);
  });
  drawBed(TEX.BED_RED, 200, 50, 50);
  drawBed(TEX.BED_BLUE, 60, 90, 200);
  drawBed(TEX.BED_GREEN, 70, 170, 80);
  drawBed(TEX.BED_YELLOW, 225, 200, 60);

  drawTexture(ctx, TEX.CHEST, c => {
    fillNoisy(c, 160, 120, 70, 14);
    c.fillStyle = '#5a3d1e'; c.fillRect(0, 0, 16, 3); c.fillRect(0, 13, 16, 3);
    c.fillStyle = '#3a2810'; c.fillRect(7, 6, 2, 5);   // 锁扣
    c.fillStyle = '#d9c24a'; c.fillRect(7, 7, 2, 2);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.strokeRect(0, 0, 16, 16);
  });
  drawTexture(ctx, TEX.LADDER, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#9a6f3f';
    c.fillRect(2, 0, 2, 16); c.fillRect(12, 0, 2, 16);
    for (let y = 1; y < 16; y += 4) c.fillRect(2, y, 12, 2);
  });
  drawTexture(ctx, TEX.DOOR, c => {
    fillNoisy(c, 150, 110, 65, 12);
    c.fillStyle = '#6e4e26'; c.fillRect(0, 0, 16, 16);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    c.strokeRect(2, 2, 12, 5); c.strokeRect(2, 9, 12, 5);
    c.fillStyle = '#2a1c0c'; c.fillRect(12, 7, 2, 2);   // 门把手
  });
  drawTexture(ctx, TEX.LANTERN, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#4a3a20'; c.fillRect(6, 1, 4, 2);    // 提手
    c.fillStyle = '#6b5028'; c.fillRect(5, 3, 6, 1); c.fillRect(5, 12, 6, 1);
    c.fillStyle = '#ffd76a'; c.fillRect(6, 4, 4, 8);    // 发光笼身
    c.fillStyle = '#fff0b0'; c.fillRect(7, 5, 2, 6);
    c.fillStyle = '#6b5028'; c.fillRect(5, 6, 1, 4); c.fillRect(10, 6, 1, 4);
  });
  drawTexture(ctx, TEX.PAINTING, c => {
    c.fillStyle = '#6b4a28'; c.fillRect(0, 0, 16, 16);  // 画框
    c.fillStyle = '#e8e0c8'; c.fillRect(2, 2, 12, 12);  // 画布
    c.fillStyle = '#5a8fd0'; c.fillRect(3, 7, 10, 6);   // 山水
    c.fillStyle = '#7a5230'; c.fillRect(3, 10, 4, 4);
    c.fillStyle = '#f0d040'; c.fillRect(10, 3, 2, 2);   // 太阳
  });
  drawTexture(ctx, TEX.FLOWER_POT, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#b06038'; c.fillRect(5, 10, 6, 5);   // 盆
    c.fillStyle = '#8a4a28'; c.fillRect(4, 9, 8, 2);
    c.fillStyle = '#3a7a20'; c.fillRect(7, 4, 1, 6);    // 茎叶
    c.fillStyle = '#e04040'; c.fillRect(6, 3, 3, 3);    // 小花
  });
  drawTexture(ctx, TEX.TABLE_WOOD, c => {
    fillNoisy(c, 150, 110, 65, 12);
    c.fillStyle = '#7a5230'; c.fillRect(3, 0, 2, 16); c.fillRect(11, 0, 2, 16); // 桌腿
  });
  drawTexture(ctx, TEX.CHAIR_WOOD, c => {
    fillNoisy(c, 150, 110, 65, 12);
    c.fillStyle = '#7a5230'; c.fillRect(1, 0, 2, 16); c.fillRect(13, 0, 2, 16); // 椅腿
    c.fillRect(1, 0, 14, 3); // 靠背
  });
  drawTexture(ctx, TEX.SOFA_RED, c => {
    fillNoisy(c, 170, 60, 60, 16);
    c.fillStyle = '#7a2030'; c.fillRect(0, 0, 16, 4); c.fillRect(0, 0, 3, 16); c.fillRect(13, 0, 3, 16);
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(3, 5, 10, 3);
  });
  drawTexture(ctx, TEX.CLOCK_BLOCK, c => {
    fillNoisy(c, 140, 100, 60, 12);
    c.fillStyle = '#f5f0e0'; c.beginPath(); c.arc(8, 8, 6, 0, Math.PI*2); c.fill(); // 表盘
    c.strokeStyle = '#333'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#333'; c.fillRect(7, 8, 1, 4); c.fillRect(8, 8, 3, 1); // 指针
  });
  drawTexture(ctx, TEX.TORCH, c => {
    c.clearRect(0, 0, 16, 16);
    c.fillStyle = '#6b4a28'; c.fillRect(7, 7, 2, 9);    // 木棍
    c.fillStyle = '#f0a020'; c.fillRect(6, 4, 4, 4);    // 火焰
    c.fillStyle = '#ffe070'; c.fillRect(7, 3, 2, 4);
    c.fillStyle = '#fff8d0'; c.fillRect(7, 5, 1, 2);
  });
  // 108 木围栏
  drawTexture(ctx, TEX.FENCE, c => {
    // 中央立柱 + 横杆（围栏贴图，四边同样式）
    fillNoisy(c, 124, 86, 50, 14); // 木色底
    c.fillStyle = '#7a532c';
    c.fillRect(6, 0, 4, 16);      // 中柱
    c.fillRect(0, 4, 16, 2);      // 上横杆
    c.fillRect(0, 10, 16, 2);     // 下横杆
    c.fillStyle = 'rgba(60,38,18,0.5)';
    c.fillRect(6, 0, 1, 16);
    c.fillRect(0, 5, 16, 1); c.fillRect(0, 11, 16, 1);
  });

  return canvas;
}

export function createBlockTexture() {
  const texture = new THREE.CanvasTexture(createAtlasCanvas());
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return texture;
}

export function getBlockColor(type) {
  const colors = {
    [BlockType.GRASS]: '#5a9e32',
    [BlockType.DIRT]: '#866043',
    [BlockType.STONE]: '#808080',
    [BlockType.SAND]: '#dccc82',
    [BlockType.WOOD]: '#78503a',
    [BlockType.LEAVES]: '#2d6e1e',
    [BlockType.WATER]: '#3388dd',
    [BlockType.COZE_CYAN]: '#F46B95',
    [BlockType.SNOW_GRASS]: '#e8f0f8',
    [BlockType.SNOW]: '#f5f8fc',
    [BlockType.ICE]: '#a0c8f0',
    [BlockType.CACTUS]: '#508c3c',
    [BlockType.COBBLESTONE]: '#6e6e6e',
    [BlockType.PLANKS]: '#b48c50',
    [BlockType.GLASS]: '#c8e6ff',
    [BlockType.COAL_ORE]: '#3a3a3a',
    [BlockType.IRON_ORE]: '#c8aa82',
    [BlockType.GOLD_ORE]: '#f0d23c',
    [BlockType.DIAMOND_ORE]: '#64e6e6',
    [BlockType.SANDSTONE]: '#e1c896',
    [BlockType.GRAVEL]: '#827d78',
    [BlockType.BIRCH_WOOD]: '#dcd7c8',
    [BlockType.BIRCH_LEAVES]: '#86aa64',
    [BlockType.JUNGLE_WOOD]: '#5a3c23',
    [BlockType.JUNGLE_LEAVES]: '#2d7a1e',
    [BlockType.BRICK]: '#aa503c',
    [BlockType.PUMPKIN]: '#dc8c1e',
  };
  return colors[type] || '#ff00ff';
}

function getTexUV(texIndex) {
  const col = texIndex % ATLAS_COLS;
  const row = Math.floor(texIndex / ATLAS_COLS);
  return {
    u0: col / ATLAS_COLS, u1: (col + 1) / ATLAS_COLS,
    v0: row / ATLAS_ROWS, v1: (row + 1) / ATLAS_ROWS,
  };
}

/* ============================================
   面定义
   ============================================ */
const FACES = [
  { dir: [1, 0, 0], face: 'side', corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [1, 1, 0], uv: [0, 1] },
    { pos: [1, 1, 1], uv: [1, 1] }, { pos: [1, 0, 1], uv: [1, 0] },
  ]},
  { dir: [-1, 0, 0], face: 'side', corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [0, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [1, 0] },
  ]},
  { dir: [0, 1, 0], face: 'top', corners: [
    { pos: [0, 1, 0], uv: [0, 0] }, { pos: [0, 1, 1], uv: [0, 1] },
    { pos: [1, 1, 1], uv: [1, 1] }, { pos: [1, 1, 0], uv: [1, 0] },
  ]},
  { dir: [0, -1, 0], face: 'bottom', corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [0, 0, 0], uv: [0, 1] },
    { pos: [1, 0, 0], uv: [1, 1] }, { pos: [1, 0, 1], uv: [1, 0] },
  ]},
  { dir: [0, 0, 1], face: 'side', corners: [
    { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] },
  ]},
  { dir: [0, 0, -1], face: 'side', corners: [
    { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 1, 0], uv: [0, 1] },
    { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] },
  ]},
];

/** 十字形植物的两个交叉面 */
const CROSS_FACES = [
  // 对角面1
  [[0,0,0],[0,1,0],[1,1,1],[1,0,1]],
  [[1,0,1],[1,1,1],[0,1,0],[0,0,0]],
  // 对角面2
  [[1,0,0],[1,1,0],[0,1,1],[0,0,1]],
  [[0,0,1],[0,1,1],[1,1,0],[1,0,0]],
];

/* ============================================
   区块类 (Chunk)
   ============================================ */
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.waterMesh = null;
    this.crossMesh = null;
    this.dirty = true;
  }

  getBlock(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return BlockType.AIR;
    return this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE];
  }

  setBlock(lx, ly, lz, type) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
    this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] = type;
    this.dirty = true;
  }

  buildMesh(getWorldBlock, material, waterMaterial, crossMaterial) {
    let hasSolid = false;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== 0) { hasSolid = true; break; }
    }
    if (!hasSolid) {
      this._disposeMesh();
      this.dirty = false;
      return;
    }

    const wx0 = this.cx * CHUNK_SIZE;
    const wz0 = this.cz * CHUNK_SIZE;

    const sPos = [], sNorm = [], sUv = [], sIdx = []; let sVc = 0;
    const wPos = [], wNorm = [], wUv = [], wIdx = []; let wVc = 0;
    const cPos = [], cNorm = [], cUv = [], cIdx = []; let cVc = 0;

    const getNeighbor = (lx, ly, lz) => {
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ly >= 0 && ly < CHUNK_HEIGHT)
        return this.getBlock(lx, ly, lz);
      return getWorldBlock(wx0 + lx, ly, wz0 + lz);
    };

    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const bt = this.getBlock(lx, ly, lz);
          if (bt === BlockType.AIR) continue;
          const texMap = BLOCK_TEXTURES[bt];
          if (!texMap) continue;

          // 十字形植物
          if (texMap === 'cross') {
            const texIdx = (bt === BlockType.TALL_GRASS) ? TEX.TALL_GRASS
              : (bt === BlockType.FLOWER_RED) ? TEX.FLOWER_RED
              : (bt === BlockType.FLOWER_YELLOW) ? TEX.FLOWER_YELLOW
              : (bt === BlockType.FLOWER_WHITE) ? TEX.FLOWER_WHITE
              : (bt === BlockType.MUSHROOM_RED) ? TEX.MUSHROOM_RED
              : (bt === BlockType.MUSHROOM_BROWN) ? TEX.MUSHROOM_BROWN
              : (bt === BlockType.TORCH) ? TEX.TORCH
              : TEX.DEAD_BUSH;
            const { u0, v0, u1, v1 } = getTexUV(texIdx);
            for (const quad of CROSS_FACES) {
              for (let ci = 0; ci < 4; ci++) {
                const corner = quad[ci];
                cPos.push(lx + corner[0], ly + corner[1], lz + corner[2]);
                cNorm.push(0, 1, 0);
                // flipY=false：v0=画布顶(花头)、v1=画布底(茎)。
                // 世界顶端顶点(y=1)应显示花头→取v0；底端(y=0)贴地显示茎→取v1
                const cu = corner[0] < 0.5 ? u0 : u1;
                const cv = corner[1] > 0.5 ? v0 : v1;
                cUv.push(cu, cv);
              }
              cIdx.push(cVc, cVc + 1, cVc + 2, cVc, cVc + 2, cVc + 3);
              cVc += 4;
            }
            continue;
          }

          const isWater = bt === BlockType.WATER;
          const positions = isWater ? wPos : sPos;
          const normals = isWater ? wNorm : sNorm;
          const uvs = isWater ? wUv : sUv;
          const indices = isWater ? wIdx : sIdx;
          let vertexCount = isWater ? wVc : sVc;

          for (const face of FACES) {
            const nx = lx + face.dir[0], ny = ly + face.dir[1], nz = lz + face.dir[2];
            const neighbor = getNeighbor(nx, ny, nz);

            if (isWater) {
              if (neighbor !== BlockType.AIR) continue;
            } else {
              if (!isTransparent(neighbor)) continue;
              // 玻璃之间不渲染内部面
              if (bt === BlockType.GLASS && neighbor === BlockType.GLASS) continue;
            }

            const texIdx = texMap[face.face];
            const { u0, v0, u1, v1 } = getTexUV(texIdx);

            for (const corner of face.corners) {
              positions.push(lx + corner.pos[0], ly + corner.pos[1], lz + corner.pos[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              uvs.push(u0 + corner.uv[0] * (u1 - u0), v0 + corner.uv[1] * (v1 - v0));
            }
            indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
            vertexCount += 4;
          }
          if (isWater) wVc = vertexCount; else sVc = vertexCount;
        }
      }
    }

    this._disposeMesh();

    if (sPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(sNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
      geo.setIndex(sIdx);
      geo.computeBoundingSphere();
      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.position.set(wx0, 0, wz0);
    }

    if (wPos.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
      geo.setIndex(wIdx);
      geo.computeBoundingSphere();
      this.waterMesh = new THREE.Mesh(geo, waterMaterial);
      this.waterMesh.position.set(wx0, 0, wz0);
    }

    if (cPos.length > 0 && crossMaterial) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(cNorm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
      geo.setIndex(cIdx);
      geo.computeBoundingSphere();
      this.crossMesh = new THREE.Mesh(geo, crossMaterial);
      this.crossMesh.position.set(wx0, 0, wz0);
    }

    this.dirty = false;
  }

  _disposeMesh() {
    for (const m of [this.mesh, this.waterMesh, this.crossMesh]) {
      if (m) {
        m.geometry.dispose();
        if (m.parent) m.parent.remove(m);
      }
    }
    this.mesh = null;
    this.waterMesh = null;
    this.crossMesh = null;
  }

  dispose() { this._disposeMesh(); }
}

/* ============================================
   生物群系
   ============================================ */
export const Biome = {
  OCEAN: 0,
  PLAINS: 1,
  DESERT: 2,
  JUNGLE: 3,
  SNOW: 4,
  SAVANNA: 5,
  MOUNTAINS: 6,
  CHERRY: 7,
  TAIGA: 8,
  SWAMP: 9,
  MESA: 10,
};

export const BiomeNames = {
  [Biome.OCEAN]: '海洋',
  [Biome.PLAINS]: '平原',
  [Biome.DESERT]: '沙漠',
  [Biome.JUNGLE]: '丛林',
  [Biome.SNOW]: '雪原',
  [Biome.SAVANNA]: '热带草原',
  [Biome.MOUNTAINS]: '山地',
  [Biome.CHERRY]: '樱花林',
  [Biome.TAIGA]: '针叶林',
  [Biome.SWAMP]: '沼泽',
  [Biome.MESA]: '恶地',
};

/* ============================================
   世界类
   ============================================ */
export class World {
  constructor(scene, seed = 12345) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new SimplexNoise(seed);
    this.treeNoise = new SimplexNoise(seed + 777);
    this.tempNoise = new SimplexNoise(seed + 1234);
    this.humidNoise = new SimplexNoise(seed + 5678);
    this.continentNoise = new SimplexNoise(seed + 9999);
    this.cherryNoise = new SimplexNoise(seed + 4242);
    this.oreNoise = new SimplexNoise(seed + 31337);
    this.chunks = new Map();
    this.material = null;
    this.crossMaterial = null;
    this.pendingChunks = [];
    this.renderDistance = RENDER_DISTANCE;
    this._dirtyPriority = new Set();
    this._dirtyNormal = new Set();
    // 已生成的村庄位置（供 village.js 查询）
    this.villages = [];
    // 玩家对世界的方块改动（存档用）：chunkKey -> [[packedLocal, type], ...]
    // packedLocal = lx + lz*16 + y*256
    this.edits = new Map();
    this._trackEdits = true;
  }

  /** 打包本地方块坐标 */
  static _packLocal(lx, y, lz) { return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE; }
  static _unpackLocal(p) {
    const lx = p % CHUNK_SIZE;
    const lz = Math.floor(p / CHUNK_SIZE) % CHUNK_SIZE;
    const y = Math.floor(p / (CHUNK_SIZE * CHUNK_SIZE));
    return [lx, y, lz];
  }

  /** 记录一次玩家方块改动 */
  _recordEdit(wx, wy, wz, type) {
    if (!this._trackEdits || wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const key = this.chunkKey(cx, cz);
    if (!this.edits.has(key)) this.edits.set(key, []);
    const list = this.edits.get(key);
    const packed = World._packLocal(lx, wy, lz);
    const idx = list.findIndex((e) => e[0] === packed);
    if (idx >= 0) list[idx][1] = type; else list.push([packed, type]);
  }

  /** 区块生成完地形/生物群系后，回放玩家在该区块的历史改动 */
  applyEdits(chunk) {
    const list = this.edits.get(this.chunkKey(chunk.cx, chunk.cz));
    if (!list) return;
    for (const [packed, type] of list) {
      const [lx, y, lz] = World._unpackLocal(packed);
      chunk.setBlock(lx, y, lz, type);
    }
  }

  /** 序列化所有改动（存档导出用） */
  serializeEdits() {
    const out = {};
    for (const [key, list] of this.edits) out[key] = list;
    return out;
  }

  /** 载入改动数据（读档/导入用） */
  loadEdits(data) {
    this.edits.clear();
    if (!data) return;
    for (const key of Object.keys(data)) {
      this.edits.set(key, data[key].map((e) => [e[0], e[1]]));
    }
  }

  init() {
    const texture = createBlockTexture();
    this.material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.FrontSide });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false,
    });
    this.crossMaterial = new THREE.MeshLambertMaterial({
      map: texture, side: THREE.DoubleSide, transparent: true, alphaTest: 0.4, depthWrite: false,
    });
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, wy, lz);
  }

  setBlock(wx, wy, wz, type) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);
    this._recordEdit(wx, wy, wz, type);
    if (this.onPlayerEdit) this.onPlayerEdit();
    this._dirtyPriority.add(this.chunkKey(cx, cz));
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
  }

  /**
   * 世界生成 / 装饰物放置：写入方块但不计入"玩家改动"存档。
   * 用于出生点美化、亭台楼阁等系统生成结构。
   */
  setBlockGen(wx, wy, wz, type) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);
    this._dirtyPriority.add(this.chunkKey(cx, cz));
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const key = this.chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (chunk) { chunk.dirty = true; this._dirtyNormal.add(key); }
  }

  /** 根据温度/湿度/大陆性判定生物群系 */
  getBiome(wx, wz) {
    const temp = (this.tempNoise.noise2D(wx * 0.005, wz * 0.005) + 1) * 0.5;
    const humid = (this.humidNoise.noise2D(wx * 0.006 + 100, wz * 0.006 + 100) + 1) * 0.5;
    const continent = (this.continentNoise.noise2D(wx * 0.003, wz * 0.003) + 1) * 0.5;

    if (continent < 0.32) return Biome.OCEAN;
    if (continent < 0.42) {
      // 海滩附近：温湿度决定沼泽
      if (humid > 0.65 && temp > 0.5) return Biome.SWAMP;
      return Biome.OCEAN;
    }
    if (temp < 0.28) return Biome.SNOW;
    if (temp > 0.72 && humid < 0.28) return Biome.DESERT;
    if (temp > 0.70 && humid < 0.38) return Biome.MESA;
    if (temp > 0.55 && humid < 0.42) return Biome.SAVANNA;
    if (temp > 0.55 && humid > 0.68) return Biome.JUNGLE;
    // 樱花林：中温、中高湿度，使用专门的低频噪声斑块
    const cherry = (this.cherryNoise.noise2D(wx * 0.008, wz * 0.008) + 1) * 0.5;
    if (cherry > 0.72 && temp > 0.35 && temp < 0.65 && humid > 0.45 && humid < 0.75) return Biome.CHERRY;
    // 针叶林：寒冷且较湿
    if (temp < 0.42 && humid > 0.45) return Biome.TAIGA;
    // 沼泽：中温且极湿，地势低
    if (humid > 0.78 && temp > 0.45 && temp < 0.70) return Biome.SWAMP;
    // 山地：高频噪声起伏大时
    const mtn = this.noise.fbm(wx * 0.015, wz * 0.015, 3, 2.0, 0.5);
    if (mtn > 0.55) return Biome.MOUNTAINS;
    return Biome.PLAINS;
  }

  /** 获取群系基础地表高度 */
  _biomeHeight(wx, wz, biome) {
    const base = (this.noise.fbm(wx * 0.015, wz * 0.015, 4, 2.0, 0.5) + 1) * 0.5;
    let h;
    switch (biome) {
      case Biome.OCEAN: h = base * 14 + SEA_LEVEL - 12; break;
      case Biome.PLAINS: h = base * 12 + SEA_LEVEL + 2; break;
      case Biome.DESERT: h = base * 8 + SEA_LEVEL + 1; break;
      case Biome.JUNGLE: h = base * 14 + SEA_LEVEL + 3; break;
      case Biome.SNOW: h = base * 16 + SEA_LEVEL + 2; break;
      case Biome.SAVANNA: h = base * 10 + SEA_LEVEL + 2; break;
      case Biome.MOUNTAINS: h = base * 32 + SEA_LEVEL + 4; break;
      case Biome.CHERRY: h = base * 10 + SEA_LEVEL + 4; break;
      case Biome.TAIGA: h = base * 14 + SEA_LEVEL + 3; break;
      case Biome.SWAMP: h = base * 4 + SEA_LEVEL - 1; break;
      case Biome.MESA: h = base * 18 + SEA_LEVEL + 4; break;
      default: h = base * 12 + SEA_LEVEL + 2;
    }
    return Math.max(1, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));
  }

  // ────────────── WELCOME 文字立墙（5×7 点阵） ──────────────
  static FONT = {
    W: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[1,1,0,1,1],[0,1,0,1,0]],
    E: [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
    L: [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
    C: [[0,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,1]],
    O: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
    M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  };
  static WORD = ['W','E','L','C','O','M','E'];
  static LETTER_W = 5;
  static LETTER_SIZE = 7;
  static GAP = 2;
  static TOTAL_W = 47;
  static TEXT_START_X = -23;
  static TEXT_FLAT_RADIUS_X = 28;
  static TEXT_FLAT_RADIUS_Z = 12;
  static TEXT_WALL_Z = 0;

  _getTextBlock(wx, wy, wz) {
    if (wz < -1 || wz > 1) return BlockType.AIR;
    const size = World.LETTER_SIZE;
    if (wy < TEXT_BASE_Y || wy > TEXT_BASE_Y + size - 1) return BlockType.AIR;
    const lx = wx - World.TEXT_START_X;
    // 字体点阵第 0 行在文字顶部；世界 y 越大越靠上，因此反向取行
    const ly = size - 1 - (wy - TEXT_BASE_Y);
    if (lx < 0 || ly < 0 || ly >= size) return BlockType.AIR;
    let off = 0;
    for (const ch of World.WORD) {
      if (lx >= off && lx < off + World.LETTER_W) {
        const col = lx - off;
        return World.FONT[ch][ly][col] ? BlockType.COZE_CYAN : BlockType.AIR;
      }
      off += World.LETTER_W + World.GAP;
    }
    return BlockType.AIR;
  }

  _isInTextZone(cx, cz) {
    const x0 = cx * CHUNK_SIZE, x1 = x0 + 15;
    const z0 = cz * CHUNK_SIZE, z1 = z0 + 15;
    return x1 >= -World.TEXT_FLAT_RADIUS_X && x0 <= World.TEXT_FLAT_RADIUS_X
      && z1 >= -World.TEXT_FLAT_RADIUS_Z && z0 <= World.TEXT_FLAT_RADIUS_Z;
  }

  generateChunkData(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    // Coze 文字区：沙质平地
    if (this._isInTextZone(cx, cz)) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = wx0 + lx, wz = wz0 + lz;
          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            let b;
            if (y < TEXT_GROUND_Y - 5) b = BlockType.STONE;
            else if (y < TEXT_GROUND_Y) b = BlockType.DIRT;
            else if (y === TEXT_GROUND_Y) b = BlockType.SAND;
            else if (y >= TEXT_BASE_Y && y <= TEXT_BASE_Y + World.LETTER_SIZE - 1) b = this._getTextBlock(wx, y, wz);
            else b = BlockType.AIR;
            chunk.setBlock(lx, y, lz, b);
          }
        }
      }
      this._generateDecorations(chunk, Biome.PLAINS);
      this.applyEdits(chunk);
      return;
    }

    // 1) 地形主体（含群系）
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this.getBiome(wx, wz);
        const h = this._biomeHeight(wx, wz, biome);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let bt = BlockType.AIR;
          if (y <= h) {
            if (y === h) {
              // 地表方块按群系
              if (biome === Biome.OCEAN) bt = h < SEA_LEVEL - 2 ? BlockType.GRAVEL : BlockType.SAND;
              else if (biome === Biome.DESERT) bt = BlockType.SAND;
              else if (biome === Biome.MESA) bt = BlockType.RED_SAND;
              else if (biome === Biome.SNOW) bt = BlockType.SNOW_GRASS;
              else if (biome === Biome.MOUNTAINS && h > SEA_LEVEL + 20) bt = BlockType.STONE;
              else if (biome === Biome.SWAMP) bt = BlockType.GRASS;
              else if (biome === Biome.TAIGA) bt = BlockType.PODZOL;
              else if (biome === Biome.CHERRY) bt = BlockType.GRASS;
              else if (biome === Biome.SAVANNA) bt = BlockType.GRASS;
              else bt = BlockType.GRASS;
            } else if (y > h - 4) {
              if (biome === Biome.DESERT) bt = BlockType.SANDSTONE;
              else if (biome === Biome.MESA) bt = BlockType.RED_SANDSTONE;
              else if (biome === Biome.OCEAN) bt = BlockType.GRAVEL;
              else bt = BlockType.DIRT;
            } else {
              bt = BlockType.STONE;
              // 深层基岩层保护
              if (y === 0) bt = BlockType.BEDROCK;
              else if (y < 3 && hash(wx * 7 + y, wz * 13 + y) > 0.5) bt = BlockType.BEDROCK;
            }
          }
          chunk.setBlock(lx, y, lz, bt);
        }

        // 矿石生成（在石头中按Y深度分布）
        this._generateOres(chunk, lx, lz, h);
      }
    }

    // 2) 水体：海平面 + 大湖泊 + 小水洼
    this._generateWater(chunk);

    // 3) 群系植被与结构
    this._generateBiomeFeatures(chunk);

    // 4) 回放玩家历史改动（优先于地形/植被生成结果）
    this.applyEdits(chunk);
  }

  /** 矿石分布 */
  _generateOres(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    for (let y = 1; y < surfaceY - 1; y++) {
      if (chunk.getBlock(lx, y, lz) !== BlockType.STONE) continue;
      const r = hash(wx * 31 + y, wz * 17 + y);
      // 煤矿：y<40，最常见
      if (y < 40 && r > 0.92) chunk.setBlock(lx, y, lz, BlockType.COAL_ORE);
      // 铁矿：y<28
      else if (y < 28 && r > 0.955) chunk.setBlock(lx, y, lz, BlockType.IRON_ORE);
      // 金矿：y<18，稀有
      else if (y < 18 && r > 0.982) chunk.setBlock(lx, y, lz, BlockType.GOLD_ORE);
      // 红石：y<16
      else if (y < 16 && r > 0.975) chunk.setBlock(lx, y, lz, BlockType.REDSTONE_ORE);
      // 青金石：y<20
      else if (y < 20 && r > 0.985) chunk.setBlock(lx, y, lz, BlockType.LAPIS_ORE);
      // 绿宝石（山地，极稀有）：y<22
      else if (y < 22 && r > 0.993 && this.getBiome(wx, wz) === Biome.MOUNTAINS) chunk.setBlock(lx, y, lz, BlockType.EMERALD_ORE);
      // 钻石矿：y<12，极稀有
      else if (y < 12 && r > 0.994) chunk.setBlock(lx, y, lz, BlockType.DIAMOND_ORE);
      // 花岗岩/闪长岩/安山岩矿脉
      else if (y < 30 && r > 0.97) {
        const rr = hash(wx + y * 3, wz + y * 5);
        chunk.setBlock(lx, y, lz, rr < 0.33 ? BlockType.GRANITE : rr < 0.66 ? BlockType.DIORITE : BlockType.ANDESITE);
      }
    }
  }

  /** 水体生成 */
  _generateWater(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        let surfaceY = -1;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          if (isSolid(chunk.getBlock(lx, y, lz))) { surfaceY = y; break; }
        }
        if (surfaceY < 0) continue;

        let waterLevel = -1;
        if (surfaceY < SEA_LEVEL) {
          waterLevel = SEA_LEVEL;
        } else {
          // 大型湖泊：低频大陆噪声的"洼地"
          const lakeVal = this.continentNoise.noise2D(wx * 0.004 + 200, wz * 0.004 + 200);
          if (lakeVal > 0.28 && surfaceY < SEA_LEVEL + 5) {
            waterLevel = surfaceY + 3; // 大湖深3格
          } else {
            const puddleVal = this.continentNoise.noise2D(wx * 0.05 + 5000, wz * 0.05 + 5000);
            if (puddleVal > 0.62 && surfaceY > SEA_LEVEL && surfaceY < SEA_LEVEL + 4) {
              waterLevel = surfaceY + 1;
            }
          }
        }
        if (waterLevel > surfaceY) {
          for (let y = surfaceY + 1; y <= waterLevel; y++) {
            if (chunk.getBlock(lx, y, lz) === BlockType.AIR) chunk.setBlock(lx, y, lz, BlockType.WATER);
          }
        }
        // 冰面：雪原群系的水面结冰
        if (waterLevel > surfaceY) {
          const biome = this.getBiome(wx, wz);
          if (biome === Biome.SNOW) {
            for (let y = waterLevel; y > surfaceY; y--) {
              if (chunk.getBlock(lx, y, lz) === BlockType.WATER) {
                chunk.setBlock(lx, y, lz, BlockType.ICE);
                break;
              }
            }
          }
        }
      }
    }
  }

  /** 群系特定植被 */
  _generateBiomeFeatures(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this.getBiome(wx, wz);
        let surfaceY = -1, surfaceBlock = BlockType.AIR;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const b = chunk.getBlock(lx, y, lz);
          if (isSolid(b)) { surfaceY = y; surfaceBlock = b; break; }
        }
        if (surfaceY < 0 || surfaceY > CHUNK_HEIGHT - 10) continue;

        const r = hash(wx * 7 + 13, wz * 13 + 7);
        const treeR = this.treeNoise.noise2D(wx * 0.4, wz * 0.4);

        switch (biome) {
          case Biome.PLAINS:
            if (surfaceBlock === BlockType.GRASS) {
              if (treeR > 0.82) this._placeTree(chunk, lx, surfaceY, lz, BlockType.WOOD, BlockType.LEAVES);
              else if (r > 0.85) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.TALL_GRASS);
              else if (r > 0.8) this._placeFlower(chunk, lx, surfaceY + 1, lz, r);
            }
            break;
          case Biome.DESERT:
            if (surfaceBlock === BlockType.SAND) {
              if (r > 0.96) this._placeCactus(chunk, lx, surfaceY, lz);
              else if (r > 0.92) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.DEAD_BUSH);
            }
            break;
          case Biome.JUNGLE:
            if (surfaceBlock === BlockType.GRASS) {
              if (treeR > 0.65) this._placeTree(chunk, lx, surfaceY, lz, BlockType.JUNGLE_WOOD, BlockType.JUNGLE_LEAVES, 5 + (hash(wx,wz)*4|0));
              else if (r > 0.7) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.TALL_GRASS);
            }
            break;
          case Biome.SNOW:
            if (surfaceBlock === BlockType.SNOW_GRASS) {
              if (treeR > 0.8) this._placeTree(chunk, lx, surfaceY, lz, BlockType.BIRCH_WOOD, BlockType.BIRCH_LEAVES);
            }
            break;
          case Biome.SAVANNA:
            if (surfaceBlock === BlockType.GRASS) {
              if (treeR > 0.78) this._placeTree(chunk, lx, surfaceY, lz, BlockType.BIRCH_WOOD, BlockType.LEAVES, 4);
              else if (r > 0.82) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.TALL_GRASS);
            }
            break;
          case Biome.MOUNTAINS:
            if (surfaceBlock === BlockType.GRASS && r > 0.9) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.TALL_GRASS);
            if (surfaceBlock === BlockType.STONE && surfaceY > SEA_LEVEL + 22 && r > 0.985) chunk.setBlock(lx, surfaceY + 1, lz, BlockType.SNOW);
            break;
          case Biome.CHERRY:
            // 樱花林：粉色树叶
            if (treeR > 0.72) this._placeTree(chunk, lx, surfaceY, lz, BlockType.CHERRY_WOOD, BlockType.CHERRY_LEAVES, 4 + (hash(wx, wz) * 2 | 0));
            else if (r > 0.82) this._placeFlower(chunk, lx, surfaceY + 1, lz, r, true);
            else if (r > 0.72) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.TALL_GRASS);
            break;
          case Biome.TAIGA:
            // 针叶林：云杉树
            if (treeR > 0.74) this._placeTree(chunk, lx, surfaceY, lz, BlockType.SPRUCE_WOOD, BlockType.SPRUCE_LEAVES, 6 + (hash(wx, wz) * 3 | 0));
            else if (r > 0.88) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.MUSHROOM_BROWN);
            break;
          case Biome.SWAMP:
            // 沼泽：深色橡树、蘑菇、浅水（已由水生成处理）
            if (treeR > 0.82) this._placeTree(chunk, lx, surfaceY, lz, BlockType.DARK_OAK_WOOD, BlockType.DARK_OAK_LEAVES, 4);
            else if (r > 0.8) this._placeCross(chunk, lx, surfaceY + 1, lz, r > 0.9 ? BlockType.MUSHROOM_RED : BlockType.MUSHROOM_BROWN);
            break;
          case Biome.MESA:
            // 恶地：红沙、枯灌木、偶尔仙人掌
            if (surfaceBlock === BlockType.RED_SAND) {
              if (r > 0.95) this._placeCactus(chunk, lx, surfaceY, lz);
              else if (r > 0.9) this._placeCross(chunk, lx, surfaceY + 1, lz, BlockType.DEAD_BUSH);
            }
            break;
        }
      }
    }
  }

  /** Coze立墙周围空地装饰 */
  _generateDecorations(chunk, biome) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        // 只在沙地上放装饰
        if (chunk.getBlock(lx, TEXT_GROUND_Y, lz) !== BlockType.SAND) continue;
        const r = hash(wx * 7 + 99, wz * 3 + 99);
        if (r > 0.93) this._placeCross(chunk, lx, TEXT_GROUND_Y + 1, lz, BlockType.FLOWER_RED);
        else if (r > 0.88) this._placeCross(chunk, lx, TEXT_GROUND_Y + 1, lz, BlockType.FLOWER_YELLOW);
        else if (r > 0.84) this._placeCross(chunk, lx, TEXT_GROUND_Y + 1, lz, BlockType.FLOWER_WHITE);
        else if (r > 0.8) this._placeCross(chunk, lx, TEXT_GROUND_Y + 1, lz, BlockType.TALL_GRASS);
      }
    }
  }

  _placeCross(chunk, lx, y, lz, type) {
    if (chunk.getBlock(lx, y, lz) === BlockType.AIR) chunk.setBlock(lx, y, lz, type);
  }

  _placeFlower(chunk, lx, y, lz, r, preferPink) {
    let type;
    if (preferPink) type = r > 0.9 ? BlockType.FLOWER_RED : r > 0.8 ? BlockType.FLOWER_WHITE : BlockType.FLOWER_YELLOW;
    else type = r > 0.9 ? BlockType.FLOWER_RED : r > 0.85 ? BlockType.FLOWER_YELLOW : BlockType.FLOWER_WHITE;
    this._placeCross(chunk, lx, y, lz, type);
  }

  _placeTree(chunk, lx, surfaceY, lz, woodType, leafType, trunkH) {
    const h = trunkH || (4 + ((hash(lx, lz) * 3) | 0));
    for (let ty = 1; ty <= h; ty++) chunk.setBlock(lx, surfaceY + ty, lz, woodType);
    const canopyY = surfaceY + h;
    const radius = leafType === BlockType.JUNGLE_LEAVES ? 3 : 2;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 1) continue;
          const bx = lx + dx, bz = lz + dz;
          if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE)
            if (chunk.getBlock(bx, canopyY + dy, bz) === BlockType.AIR) chunk.setBlock(bx, canopyY + dy, bz, leafType);
        }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
        const bx = lx + dx, bz = lz + dz;
        if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE)
          if (chunk.getBlock(bx, canopyY + 2, bz) === BlockType.AIR) chunk.setBlock(bx, canopyY + 2, bz, leafType);
      }
  }

  _placeCactus(chunk, lx, surfaceY, lz) {
    const h = 2 + ((hash(lx, lz) * 3) | 0);
    for (let ty = 1; ty <= h; ty++) chunk.setBlock(lx, surfaceY + ty, lz, BlockType.CACTUS);
  }

  update(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const needed = new Set();
    const rd = this.renderDistance;
    for (let dx = -rd; dx <= rd; dx++)
      for (let dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > rd * rd) continue;
        const key = this.chunkKey(pcx + dx, pcz + dz);
        needed.add(key);
        if (!this.chunks.has(key)) this.pendingChunks.push({ cx: pcx + dx, cz: pcz + dz, key });
      }

    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.crossMesh) this.scene.remove(chunk.crossMesh);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    const maxPerFrame = 2;
    let processed = 0;
    while (this.pendingChunks.length > 0 && processed < maxPerFrame) {
      const { cx, cz, key } = this.pendingChunks.shift();
      if (this.chunks.has(key)) continue;
      const chunk = new Chunk(cx, cz);
      this.generateChunkData(chunk);
      chunk.buildMesh(
        (wx, wy, wz) => this.getBlock(wx, wy, wz),
        this.material, this.waterMaterial, this.crossMaterial
      );
      this.chunks.set(key, chunk);
      if (chunk.mesh) this.scene.add(chunk.mesh);
      if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
      if (chunk.crossMesh) this.scene.add(chunk.crossMesh);
      processed++;
    }

    let rebuilt = 0;
    const maxR = 4;
    for (const key of this._dirtyPriority) {
      if (rebuilt >= maxR) break;
      const chunk = this.chunks.get(key);
      if (chunk && chunk.dirty) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.crossMesh) this.scene.remove(chunk.crossMesh);
        chunk.buildMesh((wx, wy, wz) => this.getBlock(wx, wy, wz), this.material, this.waterMaterial, this.crossMaterial);
        if (chunk.mesh && !chunk.mesh.parent) this.scene.add(chunk.mesh);
        if (chunk.waterMesh && !chunk.waterMesh.parent) this.scene.add(chunk.waterMesh);
        if (chunk.crossMesh && !chunk.crossMesh.parent) this.scene.add(chunk.crossMesh);
        rebuilt++;
      }
    }
    this._dirtyPriority.clear();

    for (const key of this._dirtyNormal) {
      if (rebuilt >= maxR) break;
      const chunk = this.chunks.get(key);
      if (chunk && chunk.dirty) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.crossMesh) this.scene.remove(chunk.crossMesh);
        chunk.buildMesh((wx, wy, wz) => this.getBlock(wx, wy, wz), this.material, this.waterMaterial, this.crossMaterial);
        if (chunk.mesh && !chunk.mesh.parent) this.scene.add(chunk.mesh);
        if (chunk.waterMesh && !chunk.waterMesh.parent) this.scene.add(chunk.waterMesh);
        if (chunk.crossMesh && !chunk.crossMesh.parent) this.scene.add(chunk.crossMesh);
        rebuilt++;
      }
    }
    this._dirtyNormal.clear();

    if (rebuilt < maxR) {
      for (const [, chunk] of this.chunks) {
        if (chunk.dirty && rebuilt < maxR) {
          if (chunk.mesh) this.scene.remove(chunk.mesh);
          if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
          if (chunk.crossMesh) this.scene.remove(chunk.crossMesh);
          chunk.buildMesh((wx, wy, wz) => this.getBlock(wx, wy, wz), this.material, this.waterMaterial, this.crossMaterial);
          if (chunk.mesh && !chunk.mesh.parent) this.scene.add(chunk.mesh);
          if (chunk.waterMesh && !chunk.waterMesh.parent) this.scene.add(chunk.waterMesh);
          if (chunk.crossMesh && !chunk.crossMesh.parent) this.scene.add(chunk.crossMesh);
          rebuilt++;
        }
      }
    }
  }

  getSurfaceHeight(wx, wz) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(wx, y, wz))) return y + 1;
    }
    return SEA_LEVEL;
  }

  /**
   * 在给定中心附近搜索目标群系的安全出生点。
   * 仅做噪声级判定（便宜），返回 { x, z } 或 null。
   * 具体落地高度在区块生成后用 getSurfaceHeight 取。
   */
  findBiomeSpawn(targetBiome, cx = 0, cz = 0, maxRadius = 64) {
    let best = null;
    let bestDist = Infinity;
    for (let r = 0; r <= maxRadius && !best; r += 4) {
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const wx = Math.round(cx + Math.cos(ang) * r);
        const wz = Math.round(cz + Math.sin(ang) * r);
        if (this.getBiome(wx, wz) === targetBiome) {
          // 必须是干燥陆地：地表高于海平面至少 1 格，避免出生在水里
          const surfaceY = this.getSurfaceHeight(wx, wz);
          if (surfaceY <= SEA_LEVEL + 1) continue;
          const d = (wx - cx) ** 2 + (wz - cz) ** 2;
          if (d < bestDist) { bestDist = d; best = { x: wx, z: wz }; }
        }
      }
    }
    return best;
  }

  /** 找任意干燥陆地点（海平面以上），用于兜底出生点 */
  findDryLand(cx = 0, cz = 0, maxRadius = 96) {
    let best = null;
    let bestDist = Infinity;
    for (let r = 0; r <= maxRadius && !best; r += 3) {
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const wx = Math.round(cx + Math.cos(ang) * r);
        const wz = Math.round(cz + Math.sin(ang) * r);
        const surfaceY = this.getSurfaceHeight(wx, wz);
        if (surfaceY > SEA_LEVEL + 1) {
          const d = (wx - cx) ** 2 + (wz - cz) ** 2;
          if (d < bestDist) { bestDist = d; best = { x: wx, z: wz }; }
        }
      }
    }
    return best;
  }

  /** 设置渲染距离 */
  setRenderDistance(rd) { this.renderDistance = rd; }

  /**
   * 出生点清场：确保某格及以上若干格为空气（玩家身体+相机+第三人称视野不被埋）
   * 在所有装饰（树/花/凉亭）完成后调用，把可能压在出生点的叶子/树干/花清掉。
   */
  clearSpawnArea(x, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    let topY = 0;
    // 找该列最高的实心方块（站到它上面）
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.getBlock(bx, y, bz)) || isLiquid(this.getBlock(bx, y, bz))) { topY = y; break; }
    }
    // 若落点是水，向下找到水底再垫高
    if (isLiquid(this.getBlock(bx, topY, bz))) {
      let floorY = topY;
      while (floorY > 0 && isLiquid(this.getBlock(bx, floorY, bz))) floorY--;
      // 填到水面以上
      for (let y = floorY + 1; y <= topY + 1; y++) this.setBlockGen(bx, y, bz, BlockType.GRASS);
      topY = topY + 1;
    }
    // 清出站立点上方 3 格空气（3x3 范围，防被树叶/树干埋住）
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (let y = topY + 1; y <= topY + 3; y++) this.setBlockGen(bx + dx, y, bz + dz, BlockType.AIR);
    return { x: bx + 0.5, y: topY, z: bz + 0.5 };
  }
}

/* ============================================
   设备检测
   ============================================ */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 1);
}

export function getRenderDistance() {
  return isMobileDevice() ? MOBILE_RENDER_DISTANCE : RENDER_DISTANCE;
}
