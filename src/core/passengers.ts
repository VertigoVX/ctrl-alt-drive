import type { Rng } from './rng';

export type PassengerKind = 'regular' | 'rush' | 'tourist' | 'business' | 'vip';

export interface KindRules {
  label: string;
  /** Chance of this kind, out of 1. */
  weight: number;
  fareMultiplier: number;
  meterMultiplier: number;
  /** Added to the base chance of a tip for a clean cab. */
  tipBias: number;
}

export const PASSENGER_KINDS: Record<PassengerKind, KindRules> = {
  regular: { label: 'Passenger', weight: 0.55, fareMultiplier: 1, meterMultiplier: 1, tipBias: 0 },
  rush: { label: 'In a hurry', weight: 0.15, fareMultiplier: 1.4, meterMultiplier: 0.75, tipBias: 0 },
  tourist: { label: 'Sightseeing', weight: 0.15, fareMultiplier: 1.1, meterMultiplier: 1.3, tipBias: 0.05 },
  business: { label: 'Business', weight: 0.11, fareMultiplier: 1.2, meterMultiplier: 1, tipBias: 0.25 },
  vip: { label: 'VIP', weight: 0.04, fareMultiplier: 2, meterMultiplier: 1, tipBias: 0.2 },
};

export const VIP_NAMES = ['Shingai', 'Mark', 'Tiago', 'Denisha', 'Tsebo', 'Archal', 'Jordan', 'Duncan'];

/**
 * Everyday passengers from anywhere. Each city also has its own local pool (see cities.ts), and
 * the two are mixed. None of these may be a VIP name: a VIP name should always mean a VIP.
 */
export const GLOBAL_NAMES: readonly string[] = [
  // carried over from the original list
  'Maya', 'Jonah', 'Priya', 'Amara', 'Luis', 'Nadia', 'Kenji', 'Zanele', 'Oscar', 'Tariq', 'Freya', 'Sipho',
  'Mei', 'Rafael', 'Lerato', 'Ayla', 'Dmitri', 'Chidi', 'Sofia', 'Arjun', 'Leila', 'Mateo', 'Hana', 'Kwame',
  'Elif', 'Noah', 'Yuki', 'Thandi', 'Omar', 'Clara', 'Ingrid', 'Diego', 'Aiko', 'Femi', 'Lucia', 'Bongani',
  // Africa
  'Ama', 'Chinedu', 'Ngozi', 'Amina', 'Yaw', 'Folake', 'Tendai', 'Rudo', 'Themba', 'Kagiso', 'Mpho', 'Palesa',
  'Sizwe', 'Ayanda', 'Busisiwe', 'Tumelo', 'Refilwe', 'Oluwaseun', 'Adaeze', 'Emeka', 'Ifeoma', 'Kwesi', 'Abena',
  'Zodwa', 'Neo', 'Karabo', 'Khanyi', 'Lwazi', 'Nandi', 'Tapiwa', 'Farai', 'Chipo', 'Tafara', 'Amani', 'Imani',
  'Zuri', 'Wanjiru', 'Otieno',
  // Europe
  'Lars', 'Greta', 'Nils', 'Astrid', 'Matteo', 'Giulia', 'Luca', 'Chiara', 'Marco', 'Elena', 'Katarina', 'Mila',
  'Nikola', 'Anja', 'Pavel', 'Tereza', 'Jakub', 'Magda', 'Bruno', 'Carla', 'Joao', 'Marta', 'Pedro', 'Rosalia',
  'Emilio', 'Pilar', 'Alvaro', 'Beatrix', 'Willem', 'Sanne', 'Daan', 'Lotte', 'Henrik', 'Sigrid', 'Anders',
  'Maren', 'Stellan', 'Oona', 'Aino', 'Mikko', 'Elsa', 'Viktor', 'Zofia', 'Tomasz', 'Agnieszka', 'Ioana', 'Radu',
  'Mirela', 'Andrei', 'Svetlana', 'Boris', 'Irina', 'Felix', 'Iris', 'Jasper',
  // Asia and the Middle East
  'Aarav', 'Ananya', 'Vikram', 'Meera', 'Rohan', 'Kavya', 'Sanjay', 'Divya', 'Imran', 'Zainab', 'Hassan',
  'Fatima', 'Min-jun', 'Seo-yeon', 'Ji-woo', 'Hyun', 'Soo-ah', 'Jae', 'Bao', 'Linh', 'Thao', 'Anh', 'Dao',
  'Putri', 'Budi', 'Dewi', 'Wayan', 'Aditya', 'Tenzin', 'Dolma', 'Pema', 'Chen', 'Xiu', 'Jing', 'Lan', 'Yan',
  'Ping', 'Hiro', 'Takeshi', 'Emi', 'Naoko', 'Daichi', 'Rin', 'Kaori', 'Samira', 'Khalid', 'Layla', 'Nabil',
  'Rana', 'Salma', 'Tamer', 'Yara', 'Zaid', 'Dina', 'Mansour', 'Noa', 'Yael', 'Ahmet', 'Deniz', 'Selin',
  // The Americas, the Pacific and elsewhere
  'Camila', 'Valentina', 'Santiago', 'Isabella', 'Gabriel', 'Daniela', 'Andres', 'Carolina', 'Javier', 'Paloma',
  'Esteban', 'Luz', 'Ximena', 'Rodrigo', 'Beatriz', 'Thiago', 'Larissa', 'Caio', 'Fernanda', 'Nico', 'Malia',
  'Tane', 'Aroha', 'Manu', 'Leilani', 'Keoni', 'Grace', 'Henry', 'Ruth', 'Walter', 'Eleanor', 'Cora', 'Silas',
  'Pearl', 'June', 'Otis', 'Wren', 'Hazel', 'Miles', 'Nora', 'Ellis', 'Audrey', 'Calvin', 'Dani', 'Elliot',
  'Gemma', 'Harvey', 'Ivy', 'Jude',
];

export interface Passenger {
  name: string;
  kind: PassengerKind;
}

/**
 * Deals names like a shuffled deck: every name once before any repeats. When the deck is
 * reshuffled, the first few cards are kept clear of the most recently dealt names, so a name
 * never returns within `guard` draws (a tenth of the deck at most). Picking at random with
 * replacement is what makes repeats feel common even from a long list.
 */
export class NameDeck {
  private order: string[] = [];
  private recent: string[] = [];
  private readonly guard: number;

  constructor(private rng: Rng, private names: readonly string[]) {
    this.guard = Math.min(10, Math.floor(names.length / 4));
  }

  next(): string {
    if (this.order.length === 0) this.refill();
    const name = this.order.pop()!;
    this.recent.push(name);
    if (this.recent.length > this.guard) this.recent.shift();
    return name;
  }

  private refill() {
    const order = [...this.names];
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Cards are dealt from the end. Swap any recently dealt name out of the first `guard` cards.
    const recent = new Set(this.recent);
    const n = order.length;
    for (let k = 0; k < this.guard; k++) {
      const idx = n - 1 - k;
      if (!recent.has(order[idx])) continue;
      for (let tries = 0; tries < 60; tries++) {
        const j = this.rng.int(0, n - 1 - this.guard);
        if (recent.has(order[j])) continue;
        [order[idx], order[j]] = [order[j], order[idx]];
        break;
      }
    }
    this.order = order;
  }
}

/** Who gets in the cab next: a passenger kind, then a name from the right deck. */
export class Roster {
  private local: NameDeck | null;
  private global: NameDeck | null;
  private vips: NameDeck;

  /**
   * @param local this city's own names
   * @param global names from anywhere; mixed in so each city isn't limited to its local pool
   * @param localShare how often a regular passenger is drawn from the local pool
   */
  constructor(private rng: Rng, local: readonly string[], global: readonly string[] = GLOBAL_NAMES, private localShare = 0.5) {
    const banned = new Set(VIP_NAMES.map((n) => n.toLowerCase()));
    const seen = new Set<string>();
    const clean = (list: readonly string[]) =>
      list.filter((n) => {
        const k = n.toLowerCase();
        if (banned.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const l = clean(local);
    const g = clean(global);
    this.local = l.length ? new NameDeck(rng, l) : null;
    this.global = g.length ? new NameDeck(rng, g) : null;
    this.vips = new NameDeck(rng, VIP_NAMES);
  }

  pick(): Passenger {
    let roll = this.rng.next();
    let kind: PassengerKind = 'regular';
    for (const [k, rules] of Object.entries(PASSENGER_KINDS) as [PassengerKind, KindRules][]) {
      if (roll < rules.weight) {
        kind = k;
        break;
      }
      roll -= rules.weight;
    }
    if (kind === 'vip') return { kind, name: this.vips.next() };
    const useLocal = this.local && (!this.global || this.rng.chance(this.localShare));
    const deck = useLocal ? this.local : this.global;
    return { kind, name: deck ? deck.next() : 'Passenger' };
  }
}
