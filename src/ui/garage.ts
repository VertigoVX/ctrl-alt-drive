import type { ThemeId } from '../core/settings';
import { availableThemes, buy, CATALOG, equip, itemById, type Category, type Profile, type ShopItem } from '../core/shop';
import { drawGarageStage, drawMapSwatch, drawMiniTaxi } from '../render/garagePreview';
import type { TaxiLook } from '../render/taxiSprite';

const MAP_ITEM_THEME: Record<string, ThemeId> = {
  'map-standard': 'night',
  'map-vintage': 'vintage',
  'map-blueprint': 'blueprint',
  'map-neon': 'neon',
};

export const themeForMapItem = (id: string, current: ThemeId): ThemeId =>
  id === 'map-standard' ? (current === 'day' ? 'day' : 'night') : MAP_ITEM_THEME[id] ?? 'night';

export const mapItemForTheme = (theme: ThemeId): string =>
  theme === 'night' || theme === 'day' ? 'map-standard' : `map-${theme}`;

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

const SPEAKER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';

export interface GarageDeps {
  getProfile(): Profile;
  setProfile(p: Profile): void;
  getTheme(): ThemeId;
  setTheme(t: ThemeId): void;
  playHorn(id: string): void;
  onClose(): void;
  reducedMotion: boolean;
}

export class Garage {
  private category: Category = 'paint';
  private selected: string;
  private raf = 0;
  private time = 0;
  private el = (id: string) => document.getElementById(id)!;

  constructor(private deps: GarageDeps) {
    this.selected = deps.getProfile().equipped.paint;
    document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => this.setCategory(b.dataset.cat as Category)),
    );
    this.el('buyButton').addEventListener('click', () => this.act());
    this.el('stageHorn').addEventListener('click', () => this.deps.playHorn(this.selected));
    this.el('garageDone').addEventListener('click', () => this.deps.onClose());
  }

  open() {
    this.setCategory(this.category);
    const loop = (now: number) => {
      this.time = now / 1000;
      this.drawStage();
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    cancelAnimationFrame(this.raf);
  }

  /** What the stage shows: your equipped kit, with the selected item swapped in to preview. */
  private previewLook(): { look: TaxiLook; theme: ThemeId } {
    const p = this.deps.getProfile();
    const item = itemById(this.selected);
    const look: TaxiLook = { paint: p.equipped.paint, roof: p.equipped.roof };
    let theme = this.deps.getTheme();
    if (item?.category === 'paint') look.paint = item.id;
    if (item?.category === 'roof') look.roof = item.id;
    if (item?.category === 'map') theme = themeForMapItem(item.id, theme);
    return { look, theme };
  }

  private drawStage() {
    const { look, theme } = this.previewLook();
    drawGarageStage(this.el('garageStage') as HTMLCanvasElement, theme, look, this.deps.reducedMotion ? 0 : this.time);
  }

  private setCategory(c: Category) {
    this.category = c;
    const p = this.deps.getProfile();
    this.selected = p.equipped[c];
    document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => {
      const on = b.dataset.cat === c;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    this.renderItems();
    this.renderDetail();
  }

  private select(id: string) {
    this.selected = id;
    const item = itemById(id);
    if (item?.category === 'horn') this.deps.playHorn(id);
    this.renderItems();
    this.renderDetail();
  }

  private act() {
    const p = this.deps.getProfile();
    const item = itemById(this.selected);
    if (!item) return;
    if (p.owned.includes(item.id)) {
      if (p.equipped[item.category] !== item.id) this.apply(equip(p, item.id), item);
    } else {
      const r = buy(p, item.id);
      if (r.ok) {
        this.apply(r.profile, item);
        const btn = this.el('buyButton');
        btn.classList.remove('bought');
        void btn.offsetWidth;
        btn.classList.add('bought');
      }
    }
  }

  private apply(p: Profile, item: ShopItem) {
    this.deps.setProfile(p);
    if (item.category === 'map') this.deps.setTheme(themeForMapItem(item.id, this.deps.getTheme()));
    this.renderItems();
    this.renderDetail();
  }

  private renderDetail() {
    const p = this.deps.getProfile();
    const item = itemById(this.selected)!;
    this.el('garageWallet').textContent = money(p.cash);
    this.el('detailName').textContent = item.name;
    this.el('detailBlurb').textContent = item.blurb;
    this.el('stageHorn').hidden = item.category !== 'horn';
    const btn = this.el('buyButton') as HTMLButtonElement;
    const owned = p.owned.includes(item.id);
    const equipped = p.equipped[item.category] === item.id;
    btn.classList.toggle('is-equipped', equipped);
    if (equipped) {
      btn.textContent = 'Equipped';
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = 'Equip';
      btn.disabled = false;
    } else if (p.cash >= item.price) {
      btn.textContent = `Buy for ${money(item.price)}`;
      btn.disabled = false;
    } else {
      btn.textContent = `Earn ${money(item.price - p.cash)} more`;
      btn.disabled = true;
    }
  }

  private renderItems() {
    const p = this.deps.getProfile();
    const list = this.el('garageItems');
    list.innerHTML = '';
    for (const item of CATALOG.filter((i) => i.category === this.category)) {
      const owned = p.owned.includes(item.id);
      const equipped = p.equipped[item.category] === item.id;
      const b = document.createElement('button');
      b.className = 'item' + (item.id === this.selected ? ' selected' : '');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(item.id === this.selected));
      const status = equipped ? 'Equipped' : owned ? 'Owned' : item.price === 0 ? 'Free' : money(item.price);
      const affordable = owned || p.cash >= item.price;
      b.innerHTML = `<span class="item-art"></span><span class="item-name"></span><span class="item-status${
        equipped ? ' equipped' : ''
      }${affordable ? '' : ' locked'}"></span>`;
      (b.querySelector('.item-name') as HTMLElement).textContent = item.name;
      (b.querySelector('.item-status') as HTMLElement).textContent = status;
      const art = b.querySelector('.item-art') as HTMLElement;
      if (item.category === 'horn') art.innerHTML = SPEAKER;
      else {
        const c = document.createElement('canvas');
        art.appendChild(c);
        requestAnimationFrame(() => {
          if (item.category === 'map') drawMapSwatch(c, themeForMapItem(item.id, 'night'));
          else
            drawMiniTaxi(c, {
              paint: item.category === 'paint' ? item.id : p.equipped.paint,
              roof: item.category === 'roof' ? item.id : p.equipped.roof,
            }, 1.2);
        });
      }
      b.addEventListener('click', () => this.select(item.id));
      list.appendChild(b);
    }
  }
}

export { availableThemes };
