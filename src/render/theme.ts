export type ThemeName = 'night' | 'day';

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
  },
};
