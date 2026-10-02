import {
  JEV_PLAYER_ACTION_CHOICES,
  type JevPlayerChoice
} from '../jev/evaluator.js';

export interface MinecraftSleepContext {
  dimension: string | undefined;
  timeOfDay: number | undefined;
  isRaining: boolean;
  thunderState: number | undefined;
}

export function canSleepInMinecraftContext(context: MinecraftSleepContext): boolean {
  const dimension = context.dimension?.toLowerCase();
  const isOverworld = dimension === 'minecraft:overworld' ||
    dimension === 'overworld' ||
    dimension === '0';
  if (!isOverworld) return false;

  const thunderstorm = context.isRaining && (context.thunderState ?? 0) > 0;
  return thunderstorm ||
    (context.timeOfDay !== undefined &&
      context.timeOfDay >= 12_541 &&
      context.timeOfDay <= 23_458);
}

export function shouldRoutePlayerChoice(choice: JevPlayerChoice, isMentioned: boolean): boolean {
  return isMentioned || JEV_PLAYER_ACTION_CHOICES.some((action) => action === choice);
}
