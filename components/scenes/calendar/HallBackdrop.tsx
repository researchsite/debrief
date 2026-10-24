import { PixelSprite, PX } from '@/components/pixel';
import styles from './styles';

const PLANT_ROWS = [
  '...gg.gg...',
  '..gGGgGGg..',
  '.gGGgGGGGg.',
  'gGGgGGgGGGg',
  '.gGGGgGGgg.',
  '..gGgGGgg..',
  '...ggGgg...',
  '.kkkkkkkkk.',
  '.kooooooook',
  '..kooooook.',
  '..kooooook.',
  '..kOOOOOOk.',
  '...kkkkkk..',
];

const PLANT_PALETTE = {
  g: PX.leaf,
  G: PX.grass,
  k: PX.ink,
  o: PX.orange,
  O: '#d96a2a',
};

/** Static warm-afternoon conference hall: wall, windows, banners, pillars, tiled floor. */
export function HallBackdrop() {
  return (
    <div aria-hidden className={styles.hall}>
      <div className={styles.wall}>
        <div className={styles.windows}>
          <span className={styles.window} />
          <span className={styles.window} />
          <span className={styles.window} />
        </div>
        <div className={styles.bunting}>
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={styles.flag} data-c={i % 4} />
          ))}
        </div>
        <span className={`${styles.pillar} ${styles.pillarLeft}`} />
        <span className={`${styles.pillar} ${styles.pillarRight}`} />
        <span className={styles.wallTrim} />
      </div>
      <div className={styles.floor}>
        <span className={styles.sunPatch} />
      </div>
      <PixelSprite rows={PLANT_ROWS} palette={PLANT_PALETTE} scale={5} className={styles.plantLeft} />
      <PixelSprite rows={PLANT_ROWS} palette={PLANT_PALETTE} scale={5} className={styles.plantRight} />
    </div>
  );
}
