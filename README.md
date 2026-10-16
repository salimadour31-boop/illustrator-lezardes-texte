# Détecter les lézardes — script Adobe Illustrator

**DetecterLezardes.jsx** v1.0.0 — repère dans les textes d'Illustrator les **lézardes** (rivières de blanc formées par des espaces alignés d'une ligne à l'autre), les **lignes trop lâches ou trop serrées** d'un texte justifié et les **trous** (un espace beaucoup trop large, double espace), sur un calque non imprimable. Le texte n'est jamais modifié.
*Finds rivers of white space, loose/tight justified lines and holes in Illustrator text, and marks them on a non-printing layer. Text is never modified (FR/EN dialog).*

## Le problème

Affiches, dépliants, menus, emballages, notices : dès qu'un texte est justifié dans une colonne étroite, les espaces entre les mots s'élargissent et finissent par s'aligner verticalement ou en biais, ce qui dessine des « lézardes » qui coupent le paragraphe. Le graphiste ne les voit pas parce qu'il ne lit pas le texte qu'il compose ; le client, lui, les voit sur l'imprimé. InDesign surligne au moins les lignes hors justification (Préférences > Composition > Violations C et J) et des outils payants y trouvent les lézardes, mais **Illustrator n'a rien** : il faut plisser les yeux, flouter l'écran ou retourner l'épreuve.

## Ce que fait le script

1. Pour chaque bloc (sélection ou tout le document), il **vectorise un double temporaire**, mesure la boîte réelle de chaque glyphe, puis supprime le double.
2. Il reconstitue les lignes et les associe aux lignes du texte (nombre d'espaces de chaque ligne, justification du paragraphe, dernière ligne de paragraphe). Il retrouve ainsi **la position et la largeur réelles de chaque espace entre les mots**. Si l'association échoue (texte en excès, par exemple), il passe à une détection par seuil et le signale.
3. Il mesure l'**espace normal** de chaque police (blanc entre les boîtes de « n n » à 100 pt, ou « ه ه » pour l'arabe) et exprime chaque espace en pourcentage de cet espace normal, selon le corps et l'échelle horizontale de la ligne.
4. Il détecte :
   - les **lézardes** : chaînes d'espaces qui se touchent d'une ligne à la suivante sur au moins *N* lignes (3 par défaut), droites ou en biais (tolérance réglable en % du corps), sans franchir un saut de paragraphe ni une colonne ; chaque espace n'appartient qu'à une seule lézarde ;
   - les **lignes lâches** (espace moyen > 150 % par défaut) et **serrées** (< 80 %), uniquement sur les lignes réellement étirées par la justification (la dernière ligne d'un paragraphe « justifié, dernière ligne à gauche » n'est pas contrôlée) ;
   - les **trous** : un espace isolé > 250 % (double espace, ligne d'un ou deux mots étirée), y compris en texte aligné à gauche.
5. **Marquer** dessine sur le calque « Lézardes — contrôle (non imprimable) » : un trait magenta qui suit chaque lézarde (épaisseur selon la largeur des espaces), un aplat orange (lâche) ou bleu (serrée) avec le pourcentage dans la marge, un cadre rouge autour des trous. Le calque est verrouillé et non imprimable ; relancer Marquer le remplace (pas d'accumulation), **Effacer les repères** le supprime.
6. **Analyser** donne le rapport sans rien dessiner. En option, les blocs concernés sont sélectionnés à la fermeture.

Les espaces fines et spéciales (U+2009, U+202F…) et les tabulations ne comptent pas dans les moyennes. Colonnes et rangées des textes captifs sont gérées. Ignorés : blocs verrouillés ou masqués, textes curvilignes, textes verticaux, blocs pivotés ou déformés, blocs vides.

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Illustrator** : aucune fonction native ; Illustrator n'a même pas le surlignage des violations de justification d'InDesign (aide Adobe « Adjust word and letterspacing in justified text » : seuls les réglages Minimum / Optimal / Maximum existent). Les fils Adobe Community sur les « gaps » et « rivers » dans un paragraphe Illustrator ne proposent que des réglages manuels.
- **InDesign seulement** : *Show Me the Rivers* de Mikhail Ivanyushin (présenté sur Indiscripts, novembre 2024) et le plug-in payant *Typefitter 5* (Typefi, « Highlight White Space Rivers ») cherchent les lézardes, avec l'API d'InDesign ; Peter Kahrel surligne les paragraphes dont l'espacement est modifié. Aucun ne fonctionne dans Illustrator et aucun code n'en est repris.
- **GitHub** : rien pour Illustrator (recherches « rivers text illustrator », « illustrator justification script », code `.jsx` contenant « rivers »).
- **Auteurs connus** : rien chez creold, Hiroyuki Sato, John Wundes, Alexander Ladygin, wckdtall, Kelso Cartography ni dans vexy-illustrator-scripts.
- Le code (vectorisation d'un double, association lignes ↔ texte, mesure de l'espace normal, chaînage un-à-un des espaces) est entièrement original.

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `DetecterLezardes.jsx`.
- **Permanente** : copier le fichier dans le dossier `Presets/<langue>/Scripts` d'Illustrator (par exemple `Adobe Illustrator 2026/Presets/fr_FR/Scripts`), puis redémarrer Illustrator. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. **Travaillez sur une copie** du document (le script ne modifie pas le texte, mais ajoute un calque).
2. Sélectionnez un ou plusieurs blocs de texte (ou rien, puis choisissez « Tout le document »).
3. Lancez le script, réglez les seuils, puis **Analyser** pour le rapport ou **Marquer** pour les repères.
4. Corrigez (justification, césure, approche de quelques mots, reformulation), puis relancez **Marquer** pour vérifier.
5. **Effacer les repères** retire le calque de contrôle ; Ctrl+Z / Cmd+Z annule aussi.

Limites connues : l'espace normal est mesuré entre deux « n » ; entre d'autres lettres (approches différentes, ponctuation, italique), un espace peut paraître de ±20 à 30 % plus large ou plus étroit : réglez les seuils selon la police. Les lettrines, le texte souligné et le texte mélangé gauche-droite (bidi) dans une même ligne peuvent fausser l'association des espaces. L'approche (tracking) ajoutée au texte compte comme de l'espace. Les blocs pivotés ne sont pas analysés.

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018 et versions plus récentes (ExtendScript), Windows et macOS.
- **Non testé dans Illustrator.**
- Vérifié sur l'ordinateur de développement :
  - syntaxe ES3 validée avec acorn ;
  - `node tests/test-core.js` : 54 tests (analyse du texte des lignes, regroupement en lignes avec virgules, accents et descendantes, interlignage 100 %, soulignement, choix des espaces, sens RTL, statistiques, classement, lézardes droites, obliques, coupées, un-à-un, 200 textes aléatoires et 100 lézardes injectées) ;
  - `node tests/test-simulation.js` : 36 tests sur des objets Illustrator simulés (composition justifiée simulée de 40 blocs aléatoires comparée au calcul exact, lézardes fabriquées, lignes lâches et trous, fer à gauche, espaces fines, repli quand le texte déborde, deux colonnes, rejets, Analyser / Marquer / Effacer sans accumulation ni objet temporaire restant, CMJN, textes anglais). Ces simulations ne remplacent pas un essai réel.
- Aucun appel réseau, aucune collecte de données. Les réglages sont enregistrés localement dans `DetecterLezardes.cfg` (dossier des données utilisateur).

## Licence

MIT — © 2026 Amirouche Amwanes. Voir [LICENSE](LICENSE).
