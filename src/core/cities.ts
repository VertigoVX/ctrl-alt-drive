import { generateCity, type CityMap, type LandmarkSpec } from './city';

export type CityId = 'new-york' | 'london' | 'hong-kong' | 'cape-town' | 'sydney' | 'singapore' | 'paris' | 'tokyo';

export interface CityDef {
  id: CityId;
  name: string;
  country: string;
  /** One line for the city picker. */
  tagline: string;
  /** What the player drives here, in words. */
  cabName: string;
  /** Sprite id for the player's cab. */
  cab: CityId;
  /** Robotaxi style. */
  robo: 'pod' | 'jdm';
  mapSeed: number;
  riverAxis: 'vertical' | 'horizontal';
  waterName: string;
  cutChance: number;
  parkChance: number;
  blockMin: number;
  blockMax: number;
  landmarks: (LandmarkSpec & { name: string })[];
  rowNames: string[];
  colNames: string[];
  passengers: string[];
}

export const CITIES: CityDef[] = [
  {
    id: 'new-york', name: 'New York', country: 'USA', tagline: 'A tight grid, a big park, and the most famous yellow cab there is.',
    cabName: 'Yellow cab', cab: 'new-york', robo: 'pod', mapSeed: 1101,
    riverAxis: 'vertical', waterName: 'East River', cutChance: 0.08, parkChance: 0.04, blockMin: 4, blockMax: 5,
    landmarks: [
      { id: 'central-park', name: 'Central Park', kind: 'park', blocks: [1, 2], near: 'center' },
      { id: 'empire-state', name: 'Empire State Building', kind: 'building', blocks: [1, 1], near: 'any' },
    ],
    rowNames: ['14th St', '23rd St', '34th St', '42nd St', '57th St', '72nd St', '86th St', '96th St', '110th St', '125th St'],
    colNames: ['1st Ave', '2nd Ave', '3rd Ave', 'Lexington Ave', 'Park Ave', 'Madison Ave', '5th Ave', '6th Ave', '7th Ave', 'Broadway', '8th Ave'],
    passengers: ['Tony', 'Keisha', 'Marisol', 'Jake', 'Dev', 'Rosa', 'Eli', 'Nia', 'Sal', 'Brianna'],
  },
  {
    id: 'london', name: 'London', country: 'UK', tagline: 'Winding streets either side of the Thames. Mind the black cab.',
    cabName: 'Black cab', cab: 'london', robo: 'pod', mapSeed: 2202,
    riverAxis: 'horizontal', waterName: 'Thames', cutChance: 0.28, parkChance: 0.14, blockMin: 4, blockMax: 6,
    landmarks: [
      { id: 'big-ben', name: 'Elizabeth Tower', kind: 'building', blocks: [1, 1], near: 'river' },
      { id: 'london-eye', name: 'The London Eye', kind: 'plaza', blocks: [1, 1], near: 'river' },
    ],
    rowNames: ['Oxford St', 'Regent St', 'Baker St', 'Fleet St', 'Strand', 'Piccadilly', 'Whitehall', 'Kingsway', 'Holborn', 'Pall Mall'],
    colNames: ['Park Ln', 'Charing Cross Rd', 'Tottenham Ct Rd', 'Gower St', 'Bond St', 'Shaftesbury Ave', 'Drury Ln', 'Aldwych', 'Marylebone Rd', 'Euston Rd'],
    passengers: ['Olivia', 'Harry', 'Amelia', 'Raj', 'Chloe', 'Kofi', 'Imogen', 'Alfie', 'Zara', 'Callum'],
  },
  {
    id: 'hong-kong', name: 'Hong Kong', country: 'China', tagline: 'Dense towers packed around the harbour. Red taxis everywhere.',
    cabName: 'Red taxi', cab: 'hong-kong', robo: 'pod', mapSeed: 3303,
    riverAxis: 'horizontal', waterName: 'Victoria Harbour', cutChance: 0.22, parkChance: 0.06, blockMin: 4, blockMax: 5,
    landmarks: [
      { id: 'hk-tower', name: 'Harbour tower', kind: 'building', blocks: [1, 1], near: 'river' },
      { id: 'hk-temple', name: 'Temple garden', kind: 'plaza', blocks: [1, 1], near: 'any' },
    ],
    rowNames: ['Nathan Rd', 'Des Voeux Rd', "Queen's Rd", 'Hennessy Rd', 'Lockhart Rd', 'Canton Rd', 'Gloucester Rd', 'Jaffe Rd'],
    colNames: ['Pedder St', 'Wyndham St', 'Peel St', 'Aberdeen St', 'Graham St', 'Jubilee St', 'Ice House St', 'Arsenal St'],
    passengers: ['Ka-ming', 'Wing', 'Mei-ling', 'Chun', 'Hoi-yan', 'Kenneth', 'Ying', 'Siu-fung', 'Cheuk', 'Man-yee'],
  },
  {
    id: 'cape-town', name: 'Cape Town', country: 'South Africa', tagline: 'Between the mountain and the sea. You drive the minibus taxi.',
    cabName: 'Minibus taxi', cab: 'cape-town', robo: 'pod', mapSeed: 4404,
    riverAxis: 'horizontal', waterName: 'Table Bay', cutChance: 0.24, parkChance: 0.1, blockMin: 4, blockMax: 6,
    landmarks: [
      { id: 'table-mountain', name: 'Table Mountain', kind: 'mountain', blocks: [2, 1], near: 'edge' },
      { id: 'cpt-stadium', name: 'Stadium', kind: 'building', blocks: [1, 1], near: 'river' },
    ],
    rowNames: ['Long St', 'Bree St', 'Loop St', 'Adderley St', 'Strand St', 'Wale St', 'Buitengracht St', 'Kloof St'],
    colNames: ['Darling St', 'Castle St', 'Shortmarket St', 'Hout St', 'Riebeek St', 'Orange St', 'Buitenkant St', 'Roeland St'],
    passengers: ['Thabo', 'Aisha', 'Pieter', 'Naledi', 'Riaan', 'Zintle', 'Yusuf', 'Lindiwe', 'Jarryd', 'Nomsa'],
  },
  {
    id: 'sydney', name: 'Sydney', country: 'Australia', tagline: 'Harbour city. Sails on the water, parks on the shore.',
    cabName: 'Harbour taxi', cab: 'sydney', robo: 'pod', mapSeed: 5505,
    riverAxis: 'horizontal', waterName: 'Sydney Harbour', cutChance: 0.2, parkChance: 0.12, blockMin: 4, blockMax: 6,
    landmarks: [
      { id: 'opera-house', name: 'Opera House', kind: 'building', blocks: [1, 1], near: 'river' },
      { id: 'botanic-garden', name: 'Botanic garden', kind: 'park', blocks: [1, 1], near: 'river' },
    ],
    rowNames: ['George St', 'Pitt St', 'Macquarie St', 'Oxford St', 'Elizabeth St', 'Kent St', 'Sussex St', 'Liverpool St'],
    colNames: ['Bridge St', 'Hunter St', 'King St', 'Market St', 'Park St', 'Bathurst St', 'Goulburn St', 'Castlereagh St'],
    passengers: ['Liam', 'Charlotte', 'Jack', 'Mia', 'Minh', 'Harper', 'Kai', 'Ruby', 'Lachlan', 'Isla'],
  },
  {
    id: 'singapore', name: 'Singapore', country: 'Singapore', tagline: 'Garden city on the bay. Blue taxis and a lion by the water.',
    cabName: 'Blue taxi', cab: 'singapore', robo: 'pod', mapSeed: 6606,
    riverAxis: 'vertical', waterName: 'Singapore River', cutChance: 0.16, parkChance: 0.18, blockMin: 4, blockMax: 5,
    landmarks: [
      { id: 'marina-bay-sands', name: 'Bayfront towers', kind: 'building', blocks: [1, 1], near: 'river' },
      { id: 'merlion', name: 'Merlion', kind: 'plaza', blocks: [1, 1], near: 'river' },
    ],
    rowNames: ['Orchard Rd', 'Bras Basah Rd', 'Bencoolen St', 'Victoria St', 'North Bridge Rd', 'Beach Rd', 'Raffles Blvd', 'Collyer Quay'],
    colNames: ['Stamford Rd', 'Hill St', 'Coleman St', 'Bukit Timah Rd', 'Serangoon Rd', 'Clemenceau Ave', 'Anson Rd', 'Cecil St'],
    passengers: ['Wei Ling', 'Arif', 'Priyanka', 'Jun Jie', 'Siti', 'Darren', 'Mei Xin', 'Ravi', 'Hui Min', 'Farhan'],
  },
  {
    id: 'paris', name: 'Paris', country: 'France', tagline: 'Boulevards along the Seine, with the tower always in view.',
    cabName: 'Taxi parisien', cab: 'paris', robo: 'pod', mapSeed: 7707,
    riverAxis: 'horizontal', waterName: 'Seine', cutChance: 0.26, parkChance: 0.1, blockMin: 4, blockMax: 6,
    landmarks: [
      { id: 'eiffel-tower', name: 'Eiffel Tower', kind: 'park', blocks: [1, 1], near: 'river' },
      { id: 'arc-de-triomphe', name: 'Arc de Triomphe', kind: 'plaza', blocks: [1, 1], near: 'any' },
    ],
    rowNames: ['Rue de Rivoli', 'Bd Haussmann', 'Rue du Bac', 'Av. Montaigne', 'Bd Saint-Germain', 'Rue Saint-Honoré', "Av. de l'Opéra", 'Rue de la Paix'],
    colNames: ['Champs-Élysées', 'Bd Raspail', 'Rue de Rennes', 'Av. Foch', 'Rue Royale', 'Bd Voltaire', 'Av. Kléber', 'Rue La Fayette'],
    passengers: ['Camille', 'Louis', 'Inès', 'Hugo', 'Léa', 'Mamadou', 'Chloé', 'Théo', 'Yasmine', 'Jules'],
  },
  {
    id: 'tokyo', name: 'Tokyo', country: 'Japan', tagline: 'Neon, the world’s busiest crossing, and robotaxis with a JDM streak.',
    cabName: 'Tokyo taxi', cab: 'tokyo', robo: 'jdm', mapSeed: 8808,
    riverAxis: 'vertical', waterName: 'Sumida', cutChance: 0.24, parkChance: 0.08, blockMin: 4, blockMax: 5,
    landmarks: [
      { id: 'shibuya-crossing', name: 'Shibuya Crossing', kind: 'crossing', blocks: [1, 1], near: 'center' },
      { id: 'shinjuku-towers', name: 'Shinjuku towers', kind: 'building', blocks: [1, 1], near: 'any' },
    ],
    rowNames: ['Meiji-dōri', 'Yasukuni-dōri', 'Aoyama-dōri', 'Omotesandō', 'Kōshū-kaidō', 'Sotobori-dōri', 'Harumi-dōri', 'Chūō-dōri'],
    colNames: ['Center Gai', 'Dōgenzaka', 'Kōen-dōri', 'Takeshita-dōri', 'Kabukichō', 'Shōwa-dōri', 'Hibiya-dōri', 'Ginza-dōri'],
    passengers: ['Haruto', 'Yui', 'Sota', 'Hina', 'Ren', 'Sakura', 'Kaito', 'Aoi', 'Yuto', 'Mio'],
  },
];

export const CITY_IDS = CITIES.map((c) => c.id);

export const cityById = (id: string): CityDef => CITIES.find((c) => c.id === id) ?? CITIES[0];

const cache = new Map<CityId, CityMap>();

/** The city's fixed map. Cached: every run in a city shares the same layout. */
export function generateCityMap(city: CityDef): CityMap {
  if (!cache.has(city.id))
    cache.set(
      city.id,
      generateCity({
        width: 44, height: 32, seed: city.mapSeed,
        riverAxis: city.riverAxis, cutChance: city.cutChance, parkChance: city.parkChance,
        blockMin: city.blockMin, blockMax: city.blockMax, landmarks: city.landmarks,
        rowNames: city.rowNames, colNames: city.colNames,
      }),
    );
  return cache.get(city.id)!;
}
