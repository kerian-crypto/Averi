/* ==========================================================
   AVERI LICENSING — États explicites
   ----------------------------------------------------------
   Le moteur ne retourne jamais un booléen : il retourne l'un
   de ces états. L'UI ne fait que les afficher, elle ne rejoue
   aucune vérification.
   ========================================================== */

export const STATUS = {
  /* Démonstration */
  DEMO_AVAILABLE: 'DEMO_AVAILABLE',   // jamais lancée sur cet appareil
  DEMO_ACTIVE:    'DEMO_ACTIVE',
  DEMO_EXPIRED:   'DEMO_EXPIRED',

  /* Licence */
  LICENSE_ACTIVE:           'LICENSE_ACTIVE',
  LICENSE_EXPIRED:          'LICENSE_EXPIRED',
  LICENSE_INVALID:          'LICENSE_INVALID',
  LICENSE_TAMPERED:         'LICENSE_TAMPERED',
  LICENSE_REVOKED:          'LICENSE_REVOKED',
  LICENSE_DEVICE_MISMATCH:  'LICENSE_DEVICE_MISMATCH',
  LICENSE_NOT_YET_VALID:    'LICENSE_NOT_YET_VALID',
  LICENSE_PRODUCT_MISMATCH: 'LICENSE_PRODUCT_MISMATCH',
  LICENSE_PLAN_UNKNOWN:     'LICENSE_PLAN_UNKNOWN',
  LICENSE_VERSION_UNSUPPORTED: 'LICENSE_VERSION_UNSUPPORTED',
  LICENSE_UNKNOWN:          'LICENSE_UNKNOWN',

  /* Environnement */
  CLOCK_TAMPERED: 'CLOCK_TAMPERED'
};

/** États qui donnent accès aux fonctionnalités protégées. */
export const GRANTING_STATUSES = new Set([STATUS.DEMO_ACTIVE, STATUS.LICENSE_ACTIVE]);

export function isGranting(status) {
  return GRANTING_STATUSES.has(status);
}

/**
 * Message destiné à l'utilisateur final.
 * Aucun détail cryptographique n'y transparaît : « la signature
 * Ed25519 est invalide » n'aide personne et inquiète tout le monde.
 */
export const USER_MESSAGES = {
  DEMO_AVAILABLE: {
    title: 'Essayez Averi pendant une heure',
    body: 'Découvrez toutes les manches gratuitement, sans compte ni carte.'
  },
  DEMO_ACTIVE: {
    title: 'Démonstration en cours',
    body: 'Vous avez accès à toutes les manches pendant votre heure d’essai.'
  },
  DEMO_EXPIRED: {
    title: 'Votre période de démonstration est terminée',
    body: 'Choisissez une licence pour continuer à jouer.'
  },
  LICENSE_ACTIVE: {
    title: 'Licence active',
    body: 'Bon jeu à vous deux.'
  },
  LICENSE_EXPIRED: {
    title: 'Votre licence a expiré',
    body: 'Renouvelez-la pour retrouver toutes vos manches.'
  },
  LICENSE_INVALID: {
    title: 'Cette licence n’est pas valide',
    body: 'Vérifiez le code fourni par Averi, puis réessayez.'
  },
  LICENSE_TAMPERED: {
    title: 'Cette licence n’est pas valide',
    body: 'Le code semble incomplet ou modifié. Recopiez-le entièrement depuis le message reçu.'
  },
  LICENSE_REVOKED: {
    title: 'Cette licence a été désactivée',
    body: 'Contactez le support pour en obtenir une nouvelle.'
  },
  LICENSE_DEVICE_MISMATCH: {
    title: 'Licence liée à un autre appareil',
    body: 'Cette licence a été émise pour un autre téléphone ou ordinateur. Le support peut la transférer.'
  },
  LICENSE_NOT_YET_VALID: {
    title: 'Licence pas encore active',
    body: 'Cette licence commence plus tard. Réessayez à sa date de début.'
  },
  LICENSE_PRODUCT_MISMATCH: {
    title: 'Cette licence n’est pas prévue pour Averi',
    body: 'Vérifiez que le code vient bien d’Averi.'
  },
  LICENSE_PLAN_UNKNOWN: {
    title: 'Licence non reconnue',
    body: 'Cette version d’Averi ne connaît pas cette offre. Mettez l’application à jour.'
  },
  LICENSE_VERSION_UNSUPPORTED: {
    title: 'Licence trop récente',
    body: 'Mettez Averi à jour pour utiliser cette licence.'
  },
  LICENSE_UNKNOWN: {
    title: 'Aucune licence active',
    body: 'Activez une licence ou lancez la démonstration.'
  },
  CLOCK_TAMPERED: {
    title: 'Horloge incohérente',
    body: 'La date de votre appareil a reculé. Remettez-la à l’heure pour continuer.'
  }
};

export function userMessage(status) {
  return USER_MESSAGES[status] || USER_MESSAGES.LICENSE_UNKNOWN;
}
