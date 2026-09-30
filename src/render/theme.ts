import type { ThemeId } from '../core/settings';

export type ThemeName = ThemeId;

export interface MapTheme {
  land: string;
  park: string;
  parkEdge: string;
  water: string;
  waterEdge: string;
  road: string;
  roadCasing: string;
  roadDash: string;
  bridgeRail: string;
  roof: string;
  roofEdge: string;
  shadow: string;
  label: string;
  labelHalo: string;
  route: string;
  routeCasing: string;
  routeDone: string;
  taxi: string;
  taxiDark: string;
  av: string;
  avGlass: string;
  lidar: string;
  sensor: string;
  headlight: string;
  pursuit: string;
  pickup: string;
  dropoff: string;
  /** Composite mode for light cones — additive light only reads well on a dark map. */
  lightBlend: GlobalCompositeOperation;
  /** Whether HUD panels should use the dark or light material. */
  ui: 'dark' | 'light';
  label2: string;
}

// Colours follow Apple Maps' standard (day) and dark (night) map palettes.
export const THEMES: Record<ThemeName, MapTheme> = {
  night: {
    land: '#1E2023',
    park: '#1D3A2A',
    parkEdge: '#224431',
    water: '#10263D',
    waterEdge: '#173352',
    road: '#3A3D42',
    roadCasing: '#2A2C30',
    roadDash: '#50545A',
    bridgeRail: '#5A5F66',
    roof: '#2B2E33',
    roofEdge: '#373B41',
    shadow: 'rgba(0,0,0,0.45)',
    label: '#A1A6AD',
    labelHalo: 'rgba(30,32,35,0.9)',
    route: '#0A84FF',
    routeCasing: '#0050B4',
    routeDone: 'rgba(10,132,255,0.25)',
    taxi: '#FFD60A',
    taxiDark: '#B38F00',
    av: '#F2F4F7',
    avGlass: '#1B1D21',
    lidar: '#64D2FF',
    sensor: 'rgba(100,210,255,0.10)',
    headlight: 'rgba(255,244,214,',
    pursuit: '#FF453A',
    pickup: '#30D158',
    dropoff: '#FF453A',
    lightBlend: 'lighter',
    ui: 'dark',
    label2: 'Night',
  },
  day: {
    land: '#F3F1EC',
    park: '#CBE7C1',
    parkEdge: '#BCDDB0',
    water: '#9FCDF3',
    waterEdge: '#8DC2EE',
    road: '#FFFFFF',
    roadCasing: '#D9D4CB',
    roadDash: '#ECE8E1',
    bridgeRail: '#BDB7AD',
    roof: '#E7E3DC',
    roofEdge: '#D3CEC4',
    shadow: 'rgba(70,58,40,0.16)',
    label: '#6B6760',
    labelHalo: 'rgba(255,255,255,0.92)',
    route: '#0A84FF',
    routeCasing: '#0060DF',
    routeDone: 'rgba(10,132,255,0.25)',
    taxi: '#FFCC00',
    taxiDark: '#A88600',
    av: '#FFFFFF',
    avGlass: '#2A2D33',
    lidar: '#0AA5E0',
    sensor: 'rgba(0,150,220,0.10)',
    headlight: 'rgba(255,196,60,',
    pursuit: '#FF3B30',
    pickup: '#34C759',
    dropoff: '#FF3B30',
    lightBlend: 'source-over',
    ui: 'light',
    label2: 'Day',
  },
  // Neon Noir: rain-slick asphalt, neon kerbs and glowing rooflines.
  neon: {
    land: '#0D0A18',
    park: '#0F2620',
    parkEdge: '#123026',
    water: '#071A33',
    waterEdge: '#0E3A70',
    road: '#1C1630',
    roadCasing: '#FF2E97',
    roadDash: '#3D3066',
    bridgeRail: '#00E5FF',
    roof: '#161029',
    roofEdge: '#7A3CFF',
    shadow: 'rgba(0,0,0,0.6)',
    label: '#CDB9FF',
    labelHalo: 'rgba(13,10,24,0.9)',
    route: '#00E5FF',
    routeCasing: '#007C99',
    routeDone: 'rgba(0,229,255,0.25)',
    taxi: '#FFD60A',
    taxiDark: '#B38F00',
    av: '#EEEBFF',
    avGlass: '#0D0A18',
    lidar: '#00E5FF',
    sensor: 'rgba(0,229,255,0.10)',
    headlight: 'rgba(255,232,250,',
    pursuit: '#FF453A',
    pickup: '#30D158',
    dropoff: '#FF453A',
    lightBlend: 'lighter',
    ui: 'dark',
    label2: 'Neon Noir',
  },
  // Blueprint: the city as the planners drew it, with a yellow-pencil route.
  blueprint: {
    land: '#123E6E',
    park: '#175480',
    parkEdge: '#1B5E8E',
    water: '#0B2C52',
    waterEdge: '#2E6AA8',
    road: '#1B4F86',
    roadCasing: '#D6E6FF',
    roadDash: '#6F9BD1',
    bridgeRail: '#D6E6FF',
    roof: '#15457A',
    roofEdge: '#BCD4F5',
    shadow: 'rgba(4,20,45,0.35)',
    label: '#E4EEFF',
    labelHalo: 'rgba(18,62,110,0.9)',
    route: '#FFD60A',
    routeCasing: '#A88600',
    routeDone: 'rgba(255,214,10,0.25)',
    taxi: '#FFD60A',
    taxiDark: '#B38F00',
    av: '#FFFFFF',
    avGlass: '#0B2C52',
    lidar: '#7FDBFF',
    sensor: 'rgba(214,230,255,0.10)',
    headlight: 'rgba(255,248,220,',
    pursuit: '#FF453A',
    pickup: '#30D158',
    dropoff: '#FF6B5E',
    lightBlend: 'lighter',
    ui: 'dark',
    label2: 'Blueprint',
  },
  // Vintage: an old paper street atlas with a red-ink route.
  vintage: {
    land: '#EFE4CC',
    park: '#D3D9A8',
    parkEdge: '#C4CB95',
    water: '#B7CDBF',
    waterEdge: '#9FB9A8',
    road: '#FBF5E6',
    roadCasing: '#C9B38A',
    roadDash: '#E6DAC0',
    bridgeRail: '#A8926A',
    roof: '#E3D2B0',
    roofEdge: '#C4AE86',
    shadow: 'rgba(90,60,20,0.16)',
    label: '#5E4A2E',
    labelHalo: 'rgba(251,245,230,0.92)',
    route: '#B8452F',
    routeCasing: '#7E2A1B',
    routeDone: 'rgba(184,69,47,0.25)',
    taxi: '#F2B705',
    taxiDark: '#9C7600',
    av: '#FFFDF7',
    avGlass: '#3B3226',
    lidar: '#2F7F8F',
    sensor: 'rgba(47,127,143,0.10)',
    headlight: 'rgba(230,150,40,',
    pursuit: '#C0392B',
    pickup: '#3E8E41',
    dropoff: '#B8452F',
    lightBlend: 'source-over',
    ui: 'light',
    label2: 'Vintage',
  },
};
