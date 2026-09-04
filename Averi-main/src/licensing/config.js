/* ==========================================================
   AVERI LICENSING — Configuration centralisée
   ----------------------------------------------------------
   SOURCE UNIQUE DE VÉRITÉ.
   Prix, durées, features, plans, support : rien de tout cela
   ne doit être dupliqué ailleurs dans le code. Toute UI, tout
   moteur et le générateur de licences lisent ce fichier.
   ========================================================== */

/** Identifiant produit. Une licence émise pour un autre produit est rejetée. */
export const PRODUCT_ID = 'averi';

/** Version du format de licence produite aujourd'hui. */
export const LICENSE_FORMAT_VERSION = 1;

/** Versions de format que ce client sait encore lire (stratégie de migration). */
export const SUPPORTED_FORMAT_VERSIONS = [1];

/** Émetteur attendu dans le champ `iss`. */
export const LICENSE_ISSUER = 'averi-license-authority';

/** Durée du mode démonstration : 1 heure réelle. */
export const DEMO_DURATION_MS = 60 * 60 * 1000;

/** Seuil d'avertissement « la démo se termine bientôt ». */
export const DEMO_WARNING_MS = 10 * 60 * 1000;

/** Tolérance d'horloge acceptée avant de considérer un recul comme suspect. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/** Marge de tolérance sur les bornes de validité d'une licence (décalage de fuseau/horloge). */
export const LICENSE_CLOCK_GRACE_MS = 24 * 60 * 60 * 1000;

/* ----------------------------------------------------------
   CATALOGUE DES FEATURES
   Chaque capacité verrouillable de l'application porte un
   identifiant stable. Les plans ne font que composer ces
   identifiants : aucun code ne teste un nom de plan.
   ---------------------------------------------------------- */
export const FEATURES = {
  'game.truth':   { label: 'Action ou Vérité',      group: 'Manches' },
  'game.never':   { label: 'Je n’ai jamais',        group: 'Manches' },
  'game.likely':  { label: 'Le plus susceptible',   group: 'Manches' },
  'game.compat':  { label: 'Compatibilité',         group: 'Manches' },
  'game.c4':      { label: 'Puissance 4',           group: 'Manches' },
  'game.memory':  { label: 'Memory du duo',         group: 'Manches' },
  'chat.text':    { label: 'Discussion en direct',  group: 'Duo' },
  'chat.emotes':  { label: 'Émoticônes animées',    group: 'Duo' },
  'cards.premium':{ label: 'Cartes premium',        group: 'Contenu' },
  'session.unlimited': { label: 'Parties illimitées', group: 'Duo' }
};

export const ALL_FEATURES = Object.keys(FEATURES);

/** Identifiants des manches, dans l'ordre d'affichage. */
export const GAME_FEATURE_OF = {
  truth: 'game.truth', never: 'game.never', likely: 'game.likely',
  compat: 'game.compat', c4: 'game.c4', memory: 'game.memory'
};

/* ----------------------------------------------------------
   PLANS COMMERCIAUX (licences publiques)
   ---------------------------------------------------------- */
export const CURRENCY = 'XAF';
export const CURRENCY_LABEL = 'FCFA';

export const PLANS = {
  plan_1000: {
    id: 'plan_1000',
    name: 'Averi Duo',
    tagline: 'L’essentiel du duo, pour un mois.',
    price: 1000,
    currency: CURRENCY,
    /** Durée par défaut à l'émission. Le générateur peut la surcharger (--duration). */
    default_duration_days: 30,
    features: [
      'game.truth', 'game.never', 'game.likely', 'game.compat',
      'chat.text', 'chat.emotes', 'session.unlimited'
    ]
  },
  plan_2000: {
    id: 'plan_2000',
    name: 'Averi Duo Infini',
    tagline: 'Toutes les manches, trois mois, cartes premium.',
    price: 2000,
    currency: CURRENCY,
    default_duration_days: 90,
    features: [
      'game.truth', 'game.never', 'game.likely', 'game.compat',
      'game.c4', 'game.memory',
      'chat.text', 'chat.emotes', 'cards.premium', 'session.unlimited'
    ]
  }
};

export const PUBLIC_PLAN_IDS = Object.keys(PLANS);

/**
 * Plan interne réservé aux licences privées. Il n'est jamais proposé à la
 * vente et n'apparaît pas dans l'interface publique.
 */
export const PRIVATE_PLAN_ID = 'plan_internal';

export const PRIVATE_PLAN = {
  id: PRIVATE_PLAN_ID,
  name: 'Averi Interne',
  tagline: 'Licence d’équipe — non commercialisée.',
  price: 0,
  currency: CURRENCY,
  default_duration_days: 365,
  features: ALL_FEATURES.slice()
};

/** Retourne la définition d'un plan, publique ou privée, ou null. */
export function getPlan(planId) {
  if (planId === PRIVATE_PLAN_ID) return PRIVATE_PLAN;
  return Object.prototype.hasOwnProperty.call(PLANS, planId) ? PLANS[planId] : null;
}

/** Features accordées par le mode démo : tout, pendant une heure. */
export const DEMO_FEATURES = ALL_FEATURES.slice();

/* ----------------------------------------------------------
   PERMISSIONS (licences privées uniquement)
   ---------------------------------------------------------- */
export const PERMISSIONS = {
  admin:             { label: 'Administration',        desc: 'Accès complet à la console.' },
  support:           { label: 'Support client',        desc: 'Inspection des licences et activations.' },
  diagnostics:       { label: 'Diagnostics',           desc: 'État du stockage, de l’horloge, de l’appareil.' },
  internal_tools:    { label: 'Outils internes',       desc: 'Journal, export, préparation de demandes.' },
  testing:           { label: 'Tests',                 desc: 'Réinitialisation contrôlée de l’état local.' },
  advanced_settings: { label: 'Réglages avancés',      desc: 'Paramètres non exposés au public.' }
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

/** Permission minimale requise pour ouvrir la console privée. */
export const CONSOLE_PERMISSIONS = ['admin', 'support', 'diagnostics', 'internal_tools'];

/* ----------------------------------------------------------
   SUPPORT & PAIEMENT
   Un seul endroit. Ne jamais recopier ce numéro ailleurs.
   ---------------------------------------------------------- */
export const SUPPORT = {
  /** Numéro WhatsApp au format international, sans « + » ni espaces. */
  whatsapp: '237600000000',
  display: '+237 6 00 00 00 00',
  /** Message pré-rempli ; {plan}, {price} et {device} sont substitués. */
  message: 'Bonjour Averi, je souhaite activer le plan {plan} ({price}). ' +
           'Mon code d’appareil est : {device}',
  email: 'support@averi.app'
};

/** Nom affiché du stockage local (préfixe des clés). */
export const STORAGE_NAMESPACE = 'averi.lic.v1';

/* ----------------------------------------------------------
   CLÉ PUBLIQUE DE VÉRIFICATION
   ----------------------------------------------------------
   Clé Ed25519 publique (32 octets, base64url), injectée par
   `tools/license-generator/keygen.mjs`. Uniquement PUBLIQUE :
   elle ne permet que de vérifier, jamais de signer.
   `kid` permet une rotation de clé sans casser le format.
   ---------------------------------------------------------- */
export const TRUSTED_KEYS = {
  // Clés PUBLIQUES Ed25519 (32 octets, base64url). Aucune clé privée ici.
  k1: 'AUk-dJEVdvqKlymdyiNZGzLTaFSrBKuvkq-Z0QOXPno'
};

/** Identifiant de la clé utilisée pour les émissions courantes. */
export const ACTIVE_KEY_ID = 'k1';
