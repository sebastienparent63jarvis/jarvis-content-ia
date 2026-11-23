# RUNBOOK — Produire un format long Actu Crue (modèle validé le 23/11/2026)

Ce document est la procédure complète qu'une session Claude programmée suit pour produire
une vidéo longue (~8 min 20 s, > 8 min pour les mid-rolls) **le matin même de sa
publication (lancement 05:41)**, à partir de l'actualité fraîche. Référence visuelle : pilote Nvidia v9.
Règles détaillées : doc projet `claude/regles-or-visuels-pipeline.md` et
`claude/modele-production-actu-crue.md` (à relire en début de session avec l'outil Projects).

## 0. Prérequis (à vérifier en 1 minute, sinon s'arrêter et prévenir Sébastien)
- Dépôt : `add_repo sebastienparent63jarvis/jarvis-content-ia` (accès push), cloner, travailler dans le clone.
  Push : `git -c user.email="actucrue@users.noreply.github.com" -c user.name="Actu Crue" push origin HEAD:main`.
- Réseau : `curl -s -o /dev/null -w "%{http_code}" https://jarviscontenuia.netlify.app/api/shorts-model` doit répondre 200.
  Si 403 (proxy) : le domaine n'est pas autorisé pour les sessions → **arrêter**, et envoyer à Sébastien
  (SendUserMessage) : « Production du format long bloquée : ajoute jarviscontenuia.netlify.app et
  shotstack-api-v1-output.s3-ap-southeast-2.amazonaws.com aux domaines autorisés (claude.ai → Réglages → Capacités) ».
- Outils locaux : `node`, Playwright (`require('playwright')`), `ffmpeg`, Python PIL.

## 1. Sujet et actualité fraîche (≈ 20 min)
1. Lire le sujet prévu dans `studio/planning-long.md` (ou celui donné dans la consigne).
2. Recherche web **extended** (au moins 3 requêtes : faits du jour, chiffres, réactions) — vérifier
   que l'angle tient toujours. Si un fait majeur est tombé dans les dernières heures, l'intégrer.
   Si le sujet est dépassé, choisir le sujet le plus fort de la semaine dans le même thème et le noter.
3. Toujours : faits datés et sourcés ; allégations présentées comme telles ; pas d'opinion partisane.
4. Si `planning-long.md` indique « PAS DE PRODUCTION » à la date du jour : ne rien produire,
   envoyer une ligne à Sébastien (SendUserMessage) et s'arrêter.

## 2. Script (≈ 20 min)
- ~1 150 à 1 250 mots → ~470 s de voix. Français, phrases orales courtes, chiffres écrits en lettres
  dans le texte lu (la voix lit mal « 13 % »).
- 22 à 28 segments, ids `01`…`NN`, 2 à 4 phrases chacun. 5 chapitres (dont « Et maintenant ? »).
- Structure : accroche choc (10 s) → promesse → faits datés → **retour en arrière** → enjeux → ce qui peut
  se passer → question au spectateur + appel à l'abonnement (dernier segment).
- **Retour en arrière obligatoire (formats longs uniquement)** — un chapitre qui donne au spectateur ce qu'il faut
  savoir pour comprendre l'actualité. Le choisir selon la nature du sujet :
  - **Entreprise ou entrepreneur** (Tesla, Nvidia, Anthropic, OpenAI…) → l'histoire de la personne et/ou de
    l'entreprise : fondation, moments clés, virages, ce qui l'a rendue incontournable.
    Ex. un sujet Tesla commence par refaire l'histoire d'Elon Musk.
  - **Dirigeant politique ou État** (Poutine, Xi, Trump en tant que président…) → PAS une biographie : le contexte
    macro-géopolitique et les enjeux majeurs du pays (histoire stratégique, intérêts vitaux, contraintes,
    alliances, rapports de force). Ex. un sujet sur Poutine retrace ce que la Russie veut et craint depuis 1991.
  - **Crise, conflit, ressource** (Ormuz, Taïwan, énergie) → les racines du conflit et les intérêts des acteurs.
  Critère : raconter le passé qui EXPLIQUE l'enjeu d'aujourd'hui, pas un récit exhaustif. ~20-25 % du script.
- Titre ≤ 60 caractères ; description avec chapitres et sources.
- Fichier : `studio/productions/<slug>/production.json`
  `{title, description, category:"GÉOPOLITIQUE|ÉCONOMIE|TECH|…", chapters:{"03":"LE SÉISME",…}, people:{cle:{name,role}}, publishAt}`.

## 3. Voix calée au mot (≈ 5 min)
- `POST https://jarviscontenuia.netlify.app/api/pilote-tts-run` body `{"prefix":"long-<slug>","segments":[{"id":"01","text":"…"},…]}`
  → 202. Attendre puis `GET /api/pilote-tts-result?runId=<runId>` jusqu'à `status:"done"` (sinon `?` sans runId = dernier run).
- Enregistrer le JSON, puis `node studio/tts_to_subs.cjs <slug> tts.json` → `subs.json`.
- Vérifier : durée totale de voix ≥ 465 s (sinon allonger un segment et régénérer CE segment).

## 4. Découpage éditorial (beats.json) — le cœur du modèle
Découper chaque segment en temps de ~4 s, coupés aux débuts de ligne de `subs.json`
(`[segId, indexLigne, type, spec]`). Type choisi par ce que dit la voix à cet instant :
| Voix | Type | Part visée |
|---|---|---|
| chose nommée (personne, entreprise, institution, produit) | `P` vraie photo (id du pool) | 30 % |
| action / idée | `V` vidéo Pexels (requête anglaise, littérale) | 35 % |
| chiffre, date, citation, structure (frise, organigramme, cotes, comparaison) | `D` animation maison | 25 % |
| lieu / rapport de force géographique | `C` carte animée | 10 % |

Specs `D` (templates/anim.html) : `{t:"big",n,l,s}` · `{t:"timeline",items:[[date,texte]…],hi}` ·
`{t:"quote",q,a}` · `{t:"question",q,q2?,s?}` · `{t:"list",l,items}` · `{t:"org",l,rows:[[fonction,nom]],strike?}` ·
`{t:"odds",l,rows:[[nom,précision,pct]]}` · `{t:"bars",l,a:[lib,valeur,n],b:[lib,valeur,n],s?}` · `{t:"arrow",a:[k,txt],b:[k,txt]}`.
Specs `C` : `{lon,lat,z,k,s,hot?:[noms pays geojson]}` (zoom) · `{arc:true,cut?:true,k,s}` (États-Unis ↔ Chine) ·
`{file:"actu-assets/carte-usa-chine.mp4"}` (carte hologramme existante, 6 s max).
Règles impératives :
- Chaque temps ≥ 1,5 s ; un temps > 8 s doit être coupé. Pas 3 fois le même type d'affilée si évitable.
- Un nom propre prononcé → portrait (P) ou animation qui ÉCRIT ce nom ; **jamais** une vidéo de personne à ce moment.
- Pas de métaphore visuelle (« tenir la barre », « l'édifice tremble ») : illustrer le sens littéral.
- Une même famille de photos (même auteur/même événement) : 1 fois, 2 max à 90 s d'écart.
- Jamais de portrait d'un tiers visé par des soupçons sans être une personnalité publique.
- N'écrire dans les animations QUE des chiffres présents dans le script (et sourcés).

## 5. Photos (pool.json)
- `POST /api/image-search-background` `{runId:"<slug>",context:[…],entities:[{name,type}],keywords:[…]}` puis
  `GET /api/image-search-result?runId=<slug>`.
- Télécharger les candidats via le proxy : `curl "https://jarviscontenuia.netlify.app/api/img?u=<url encodée>"`
  (max 1150 px) dans `studio/productions/<slug>/imgs/` (NE PAS committer ce dossier).
- **Contrôle visuel obligatoire** : planche contact (PIL) + lecture de l'image. Rejeter paysages, façades
  génériques, inconnus, caricatures, gravures, stands commerciaux. (Sur Nvidia : 33/107 rejetées.)
- `pool.json` : `[{id,file:"imgs/xxx.jpg",w,h,by,lic,person?}]` (`person` = clé de `people` pour le carton nom).

## 6. Vidéos (pexels.json)
- Pour chaque temps `V` : `GET /api/stock-search?q=<requête>&orientation=landscape&n=7`.
- Planche contact des vignettes (via `/api/img?u=` sur images.pexels.com) → choisir à l'œil,
  **une vidéo différente par temps**, durée ≥ durée du temps + 0,5 s.
- `pexels.json` : `[[id,durée,url_mp4],…]` dans l'ordre des temps V.

## 7. Montage, contrôle, rendu
1. `node studio/build_long.cjs <slug>` → rapport : répartition plans/temps et `erreurs: []` obligatoire.
   Ratio réel attendu à ±10 points de 30/35/25/10.
2. Vérifier à l'œil la dernière image de chaque animation (ffmpeg -sseof) : rien sous le logo (haut-gauche),
   rien dans la zone sous-titres (bas), textes non tronqués.
3. `git add studio/productions/<slug>/*.json public/productions/<slug>` → commit → push.
4. Attendre le déploiement : `curl -s -o /dev/null -w "%{http_code}" https://jarviscontenuia.netlify.app/productions/<slug>/edit.json` = 200.
5. `POST /api/render-long` `{slug,title,description,publishAt}` → `GET /api/render-status?id=…` jusqu'à `done`.
6. Contrôle du rendu : télécharger le MP4 (URL S3), extraire une image au milieu de chaque temps V
   et vérifier qu'aucune n'est noire ; 6 images témoins.
7. `POST /api/auto-collect-test-background` → la vidéo arrive dans « À valider » (mail envoyé).
8. Compte rendu à Sébastien (SendUserMessage) : sujet, angle retenu et pourquoi, nouveautés de dernière
   heure intégrées, répartition des visuels, points à vérifier, sources.

## Jamais
Deepfake ou image IA d'une personne réelle · images Google / agences · chiffres non sourcés ·
suppression d'éléments de la file via l'API (Sébastien supprime lui-même) · modification destructive
des fonctions en production (tout changement doit être additif).
