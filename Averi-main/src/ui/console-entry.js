/* ==========================================================
   AVERI LICENSE CONSOLE — Point d'entrée
   ----------------------------------------------------------
   console.html ne contient qu'un conteneur ; tout est monté ici.
   La console partage exactement le même moteur et le même
   stockage que l'application : elle ne dispose d'aucun
   privilège que la licence privée ne lui accorde.
   ========================================================== */

import { LicenseFacade } from '../licensing/facade.js';
import { ConsoleApp } from './console-app.js';

let facade = null;
let app = null;

export function boot(rootId) {
  const root = document.getElementById(rootId || 'console-root');
  if (!root) throw new Error('Conteneur de console introuvable.');

  facade = new LicenseFacade({});
  app = new ConsoleApp({ facade, root });

  facade.subscribe(() => app.render());
  facade.init().then(() => app.render()).catch(() => app.render());
  window.addEventListener('beforeunload', () => facade.flush());

  return { facade, app };
}

export function render() { if (app) app.render(); }
