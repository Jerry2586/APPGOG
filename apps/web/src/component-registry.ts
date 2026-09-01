import type { Component } from 'vue';
import GridBlock from './components/blocks/GridBlock.vue';
import HeroBlock from './components/blocks/HeroBlock.vue';
import ButtonBlock from './components/blocks/ButtonBlock.vue';
import StructureBlock from './components/blocks/StructureBlock.vue';
import CarouselBlock from './components/blocks/CarouselBlock.vue';
import DataBlock from './components/blocks/DataBlock.vue';
import CatalogBlock from './components/blocks/CatalogBlock.vue';
import AiBlock from './components/blocks/AiBlock.vue';
import MarketingBlock from './components/blocks/MarketingBlock.vue';
import EffectBlock from './components/blocks/EffectBlock.vue';

export const componentRenderers: Record<string, Component> = {
  grid: GridBlock, hero: HeroBlock, carousel: CarouselBlock, button: ButtonBlock,
  header: StructureBlock, footer: StructureBlock, breadcrumb: StructureBlock,
  products: CatalogBlock, cart: CatalogBlock, categories: DataBlock, contents: DataBlock,
  faq: DataBlock, ai: AiBlock, sale: MarketingBlock, popup: MarketingBlock,
  countdown: MarketingBlock, particles: EffectBlock, globe: EffectBlock
};

export const rendererTypes = Object.freeze(Object.keys(componentRenderers));
