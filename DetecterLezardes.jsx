//@target illustrator
/*
 * DetecterLezardes.jsx — v1.0.0
 * Lézardes, lignes lâches et trous dans le texte / Rivers, loose lines and holes in text
 *
 * FR : Dans un texte justifié, les espaces entre les mots s'alignent parfois
 *      d'une ligne à l'autre et dessinent des « lézardes » (rivières de blanc)
 *      qui coupent le paragraphe ; certaines lignes sont trop lâches ou trop
 *      serrées. InDesign signale les lignes hors justification (et des outils
 *      payants y trouvent les lézardes), mais Illustrator n'a rien : il faut
 *      plisser les yeux ou retourner l'épreuve. Ce script vectorise un double
 *      temporaire de chaque bloc, mesure la position réelle de chaque espace
 *      entre les mots, puis repère sur un calque non imprimable :
 *        - les lézardes (espaces qui se touchent sur 3 lignes ou plus) ;
 *        - les lignes lâches ou serrées (espace moyen comparé à l'espace normal
 *          de la police, mesuré lui aussi) ;
 *        - les trous (un espace isolé beaucoup trop large, double espace).
 *      Le texte n'est jamais modifié.
 * EN : In justified text, word spaces sometimes line up from one line to the
 *      next and form "rivers" of white running through the paragraph; some
 *      lines are too loose or too tight. InDesign highlights H&J violations
 *      (and paid plug-ins find rivers) but Illustrator has nothing. This script
 *      outlines a temporary duplicate of each frame, measures the real position
 *      of every word space, and marks on a non-printing layer: rivers (spaces
 *      touching across 3+ lines), loose/tight lines (mean space vs the font's
 *      measured normal space) and holes (one space far too wide). Text is
 *      never modified.
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 */

/* ===================================================================== */
/*  1. CŒUR (pur, sans Illustrator) / PURE CORE (no Illustrator)          */
/* ===================================================================== */

var APP_CORE = (function () {
    var C = {};

    // Espaces « ordinaires » / regular spaces : U+0020, U+00A0
    C.wsKind = function (c) {
        if (c === 32 || c === 0xA0) return "r";
        if (c === 9) return "t";
        if ((c >= 0x2000 && c <= 0x200A) || c === 0x202F || c === 0x205F || c === 0x3000 || c === 0x1680) return "s";
        return "";
    };
    // Fins de ligne et caractères invisibles / breaks and invisible characters
    C.isInvisible = function (c) {
        return c < 32 || c === 0x2028 || c === 0x2029 || c === 0xAD || (c >= 0x200B && c <= 0x200F) ||
               (c >= 0x2060 && c <= 0x2064) || c === 0xFEFF;
    };
    C.isRtlChar = function (c) { return (c >= 0x0590 && c <= 0x08FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFC); };
    C.isLatinLetter = function (c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 0xC0 && c <= 0x24F); };

    // Analyse le texte d'une ligne : séquences d'espaces internes, caractères visibles, sens.
    // Analyses a line's text: internal whitespace runs, visible characters, direction.
    C.lineText = function (s) {
        var i, c, k, chars = [], runs = [], cur = null, rtl = 0, lat = 0;
        s = String(s === undefined || s === null ? "" : s);
        for (i = 0; i < s.length; i++) {
            c = s.charCodeAt(i);
            if (C.isInvisible(c) && c !== 9) continue;
            chars.push(c);
        }
        // Retire les espaces en début et fin / trim leading & trailing spaces
        var a = 0, b = chars.length - 1;
        while (a <= b && C.wsKind(chars[a])) a++;
        while (b >= a && C.wsKind(chars[b])) b--;
        var visible = 0;
        for (i = a; i <= b; i++) {
            c = chars[i]; k = C.wsKind(c);
            if (k) {
                if (!cur) { cur = { kind: k }; runs.push(cur); }
                else if (k === "t" || (cur.kind === "r" && k === "s")) cur.kind = k;
            } else {
                cur = null; visible++;
                if (C.isRtlChar(c)) rtl++; else if (C.isLatinLetter(c)) lat++;
            }
        }
        var hasTab = false;
        for (i = 0; i < runs.length; i++) if (runs[i].kind === "t") hasTab = true;
        return { runs: runs, visible: visible, rtl: rtl > lat, hasTab: hasTab };
    };

    C.median = function (arr) {
        if (!arr.length) return 0;
        var a = arr.slice(0); a.sort(function (x, y) { return x - y; });
        var m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    };

    // Boîte d'un contour de glyphe / glyph box from geometricBounds [l, t, r, b] (y vers le haut / y up)
    C.box = function (gb) { return { l: gb[0], t: gb[1], r: gb[2], b: gb[3], cy: (gb[1] + gb[3]) / 2 }; };

    // Retire les traits de soulignement / barré (très larges et très bas) / drops underline-like leaves
    C.dropRules = function (boxes) {
        if (boxes.length < 3) return boxes;
        var ws = [], hs = [], i, out = [];
        for (i = 0; i < boxes.length; i++) { ws.push(boxes[i].r - boxes[i].l); hs.push(boxes[i].t - boxes[i].b); }
        var mw = C.median(ws), mh = C.median(hs);
        for (i = 0; i < boxes.length; i++) {
            if (ws[i] > 5 * mw && hs[i] < 0.3 * mh) continue;
            out.push(boxes[i]);
        }
        return out;
    };

    function byCyDesc(a, b) { return b.cy - a.cy; }

    // Regroupe en lignes (haut → bas) par seuil sur le centre vertical.
    // Groups into lines (top → bottom) with a threshold on vertical centre.
    C.clusterGreedy = function (boxes, thr) {
        var a = boxes.slice(0), lines = [], cur = null, sum = 0, i;
        a.sort(byCyDesc);
        for (i = 0; i < a.length; i++) {
            if (cur && (sum / cur.length) - a[i].cy <= thr) { cur.push(a[i]); sum += a[i].cy; }
            else { cur = [a[i]]; sum = a[i].cy; lines.push(cur); }
        }
        return lines;
    };

    // Coupe en n lignes aux n−1 plus grands écarts verticaux / splits into n lines at the n−1 largest gaps
    C.clusterByCount = function (boxes, n) {
        var a = boxes.slice(0), i, d = [], cuts = {}, lines = [], cur = [];
        if (n < 1 || a.length < n) return null;
        a.sort(byCyDesc);
        for (i = 1; i < a.length; i++) d.push({ i: i, v: a[i - 1].cy - a[i].cy });
        d.sort(function (x, y) { return y.v - x.v; });
        for (i = 0; i < n - 1; i++) cuts[d[i].i] = true;
        for (i = 0; i < a.length; i++) {
            if (cuts[i]) { lines.push(cur); cur = []; }
            cur.push(a[i]);
        }
        lines.push(cur);
        return lines;
    };

    // Écart vertical minimal entre lignes voisines / smallest vertical step between neighbouring lines
    C.minStep = function (lines) {
        var m = Infinity, i, c = [];
        for (i = 0; i < lines.length; i++) {
            var ys = []; for (var j = 0; j < lines[i].length; j++) ys.push(lines[i][j].cy);
            c.push(C.median(ys));
        }
        for (i = 1; i < c.length; i++) m = Math.min(m, c[i - 1] - c[i]);
        return m;
    };

    // Blancs entre glyphes d'une ligne. n = nombre d'espaces attendu (ou null = seuil).
    // Gaps between glyphs of a line. n = expected count of spaces (or null = threshold).
    C.lineGaps = function (glyphs, n, size) {
        var a = glyphs.slice(0), i, cand = [], maxR;
        if (a.length < 2) return [];
        a.sort(function (x, y) { return x.l - y.l; });
        maxR = a[0].r;
        for (i = 1; i < a.length; i++) {
            var g = a[i].l - maxR;
            if (g > 0) cand.push({ x1: maxR, x2: a[i].l, w: g });
            if (a[i].r > maxR) maxR = a[i].r;
        }
        var out = [];
        if (n === null || n === undefined) {
            for (i = 0; i < cand.length; i++) if (cand[i].w > 0.12 * size) out.push(cand[i]);
        } else {
            cand.sort(function (x, y) { return y.w - x.w; });
            for (i = 0; i < cand.length && i < n; i++) out.push(cand[i]);
        }
        out.sort(function (x, y) { return x.x1 - y.x1; });
        return out;
    };

    // Attribue la nature des séquences d'espaces aux blancs (ordre visuel ; inversé en RTL).
    // Assigns run kinds to gaps (visual order; reversed for RTL).
    C.assignKinds = function (gaps, runs, rtl) {
        var i, n = gaps.length;
        for (i = 0; i < n; i++) {
            var k = rtl ? runs.length - 1 - i : i;
            gaps[i].kind = (runs.length === n && k >= 0 && k < runs.length) ? runs[k].kind : "r";
        }
        return gaps;
    };

    // Statistiques d'une ligne / line statistics. normal = largeur de l'espace normal (pt).
    C.lineStats = function (gaps, normal) {
        var i, s = 0, n = 0, mx = 0, mn = Infinity;
        for (i = 0; i < gaps.length; i++) {
            gaps[i].ratio = normal > 0 ? gaps[i].w / normal * 100 : 0;
            if (gaps[i].kind && gaps[i].kind !== "r") continue;
            s += gaps[i].ratio; n++;
            if (gaps[i].ratio > mx) mx = gaps[i].ratio;
            if (gaps[i].ratio < mn) mn = gaps[i].ratio;
        }
        return { mean: n ? s / n : 0, max: mx, min: n ? mn : 0, n: n };
    };

    // Classe une ligne / classifies a line.
    // L = { gaps, stats, checkSpacing, hasTab }, o = { loose, tight, hole, doLoose, doTight, doHoles }
    C.classify = function (L, o) {
        var r = { loose: false, tight: false, holes: [] }, i;
        if (L.hasTab || !L.stats || !L.stats.n) return r;
        if (L.checkSpacing) {
            if (o.doLoose && L.stats.mean > o.loose) r.loose = true;
            if (o.doTight && L.stats.mean < o.tight) r.tight = true;
        }
        if (o.doHoles) {
            for (i = 0; i < L.gaps.length; i++) {
                var g = L.gaps[i];
                if ((!g.kind || g.kind === "r") && g.ratio > o.hole) r.holes.push(i);
            }
        }
        return r;
    };

    // Lézardes : chaînes de blancs qui se touchent d'une ligne à la suivante.
    // Rivers: chains of gaps that touch from one line to the next.
    // lines[k] = { gaps:[{x1,x2,w,ratio,kind}], size, brk (pas contiguë à la précédente / not adjacent to previous) }
    // o = { minLines, tol (fraction du corps / fraction of size), minRatio (%) }
    C.findRivers = function (lines, o) {
        var k, i, j, next = [], hasPrev = [], res = [];
        function usable(g) { return (!g.kind || g.kind === "r") && (g.ratio === undefined || g.ratio >= o.minRatio); }
        for (k = 0; k < lines.length; k++) {
            next.push([]); hasPrev.push([]);
            for (i = 0; i < lines[k].gaps.length; i++) { next[k].push(-1); hasPrev[k].push(false); }
        }
        for (k = 0; k + 1 < lines.length; k++) {
            if (lines[k + 1].brk || lines[k].hasTab || lines[k + 1].hasTab) continue;
            var A = lines[k].gaps, B = lines[k + 1].gaps, pairs = [];
            var slack = o.tol * Math.max(lines[k].size || 0, lines[k + 1].size || 0);
            for (i = 0; i < A.length; i++) {
                if (!usable(A[i])) continue;
                for (j = 0; j < B.length; j++) {
                    if (!usable(B[j])) continue;
                    var ov = Math.min(A[i].x2, B[j].x2) - Math.max(A[i].x1, B[j].x1) + slack;
                    if (ov > 0) {
                        var dc = Math.abs((A[i].x1 + A[i].x2) / 2 - (B[j].x1 + B[j].x2) / 2);
                        pairs.push({ i: i, j: j, s: ov - 0.1 * dc });
                    }
                }
            }
            pairs.sort(function (x, y) { return y.s - x.s; });
            var usedA = {}, usedB = {};
            for (var p = 0; p < pairs.length; p++) {
                var q = pairs[p];
                if (usedA[q.i] || usedB[q.j]) continue;
                usedA[q.i] = true; usedB[q.j] = true;
                next[k][q.i] = q.j; hasPrev[k + 1][q.j] = true;
            }
        }
        for (k = 0; k < lines.length; k++) {
            for (i = 0; i < lines[k].gaps.length; i++) {
                if (hasPrev[k][i] || next[k][i] < 0) continue;
                var chain = [{ k: k, g: i }], kk = k, ii = i;
                while (next[kk] && next[kk][ii] >= 0) { ii = next[kk][ii]; kk++; chain.push({ k: kk, g: ii }); }
                if (chain.length >= o.minLines) {
                    var sw = 0;
                    for (j = 0; j < chain.length; j++) sw += lines[chain[j].k].gaps[chain[j].g].w;
                    res.push({ pts: chain, length: chain.length, meanW: sw / chain.length });
                }
            }
        }
        res.sort(function (x, y) { return y.length - x.length; });
        return res;
    };

    // Justification : ligne étirée ? / is the line stretched by justification?
    // just = "full" (toutes les lignes / all lines), "last" (justifié sauf dernière / all but last), "" (non justifié / ragged)
    C.checkSpacing = function (just, isLast, onlyJustified) {
        if (just === "full") return true;
        if (just === "last") return !isLast;
        return !onlyJustified && !isLast;
    };

    C.num = function (s, def, min, max) {
        var v = parseFloat(String(s).replace(",", "."));
        if (isNaN(v)) v = def;
        if (min !== undefined && v < min) v = min;
        if (max !== undefined && v > max) v = max;
        return v;
    };
    C.excerpt = function (s, n) {
        s = String(s || "").replace(/[\r\n\u0003\t]+/g, " ").replace(/^\s+|\s+$/g, "");
        return s.length > n ? s.substr(0, n - 1) + "…" : s;
    };
    C.round = function (v) { return Math.round(v); };
    return C;
})();

/* ===================================================================== */
/*  2. TEXTES FR/EN / FR/EN STRINGS                                       */
/* ===================================================================== */

var APP_T = (function () {
    var fr = true;
    try { fr = String($.locale || app.locale || "fr").toLowerCase().indexOf("fr") === 0; } catch (e) { fr = true; }
    var FR = {
        title: "Détecter les lézardes — v1.0.0",
        noDoc: "Aucun document n'est ouvert.\nOuvrez un document puis relancez le script.",
        noText: "Aucun bloc de texte utilisable.\nSélectionnez un ou plusieurs blocs de texte (ou choisissez « Tout le document »).",
        scope: "Portée", scopeSel: "Blocs sélectionnés ({n})", scopeDoc: "Tout le document ({n})",
        rivers: "Lézardes (espaces alignés d'une ligne à l'autre)",
        doRivers: "Chercher les lézardes", minLines: "Lignes minimales :", tol: "Tolérance (% du corps) :",
        minRatio: "Ignorer les espaces plus étroits que (% de l'espace normal) :",
        spacing: "Gris typographique",
        doLoose: "Lignes lâches : espace moyen supérieur à (%) :", doTight: "Lignes serrées : espace moyen inférieur à (%) :",
        doHoles: "Trous : un espace supérieur à (%) :", onlyJust: "Lignes lâches / serrées : paragraphes justifiés seulement",
        options: "Options", selectFrames: "Sélectionner les blocs concernés à la fermeture",
        hint: "100 % = espace normal de la police (mesuré sur « n n »). La dernière ligne d'un paragraphe justifié n'est pas étirée et n'est pas contrôlée. Le texte n'est jamais modifié ; les repères vont sur un calque non imprimable.",
        copyTip: "Conseil : travaillez sur une copie du document.",
        report: "Rapport",
        analyse: "Analyser", mark: "Marquer", clear: "Effacer les repères", close: "Fermer",
        working: "Mesure en cours…",
        layer: "Lézardes — contrôle (non imprimable)",
        skipped: "Ignorés : ",
        locked: "verrouillé ou masqué", path: "texte curviligne", vertical: "texte vertical", rotated: "pivoté ou déformé", empty: "vide",
        frame: "Bloc", lines: "lignes", fallback: "(lignes non associées au texte : détection par seuil)",
        river: "lézarde(s)", loose: "ligne(s) lâche(s)", tight: "ligne(s) serrée(s)", holes: "trou(s)",
        ok: "rien à signaler", max: "max", min: "min",
        total: "Total : {r} lézarde(s), {l} ligne(s) lâche(s), {t} ligne(s) serrée(s), {h} trou(s) sur {f} bloc(s).",
        marked: "{n} repère(s) ajouté(s) sur le calque « {layer} ». Effacer les repères pour les retirer.",
        cleared: "Repères effacés.", noLayer: "Aucun repère à effacer.",
        failed: "mesure impossible",
        undo: "Annuler : Ctrl+Z / Cmd+Z ou le bouton « Effacer les repères ».",
        tipFix: "Pour corriger : réglez la justification (Paragraphe > Justification), la césure, l'approche de quelques mots, ou reformulez."
    };
    var EN = {
        title: "Detect rivers — v1.0.0",
        noDoc: "No document is open.\nOpen a document and run the script again.",
        noText: "No usable text frame.\nSelect one or more text frames (or choose \"Whole document\").",
        scope: "Scope", scopeSel: "Selected frames ({n})", scopeDoc: "Whole document ({n})",
        rivers: "Rivers (spaces lining up from line to line)",
        doRivers: "Find rivers", minLines: "Minimum lines:", tol: "Tolerance (% of type size):",
        minRatio: "Ignore spaces narrower than (% of normal space):",
        spacing: "Type colour",
        doLoose: "Loose lines: mean space above (%):", doTight: "Tight lines: mean space below (%):",
        doHoles: "Holes: one space above (%):", onlyJust: "Loose / tight lines: justified paragraphs only",
        options: "Options", selectFrames: "Select affected frames on close",
        hint: "100% = the font's normal space (measured on \"n n\"). The last line of a justified paragraph is not stretched and is not checked. Text is never modified; marks go on a non-printing layer.",
        copyTip: "Tip: work on a copy of the document.",
        report: "Report",
        analyse: "Analyse", mark: "Mark", clear: "Clear marks", close: "Close",
        working: "Measuring…",
        layer: "Rivers — check (non-printing)",
        skipped: "Skipped: ",
        locked: "locked or hidden", path: "type on a path", vertical: "vertical type", rotated: "rotated or skewed", empty: "empty",
        frame: "Frame", lines: "lines", fallback: "(lines not matched to text: threshold detection)",
        river: "river(s)", loose: "loose line(s)", tight: "tight line(s)", holes: "hole(s)",
        ok: "nothing to report", max: "max", min: "min",
        total: "Total: {r} river(s), {l} loose line(s), {t} tight line(s), {h} hole(s) in {f} frame(s).",
        marked: "{n} mark(s) added on layer \"{layer}\". Use Clear marks to remove them.",
        cleared: "Marks cleared.", noLayer: "No marks to clear.",
        failed: "could not measure",
        undo: "Undo: Ctrl+Z / Cmd+Z or the \"Clear marks\" button.",
        tipFix: "To fix: adjust justification (Paragraph > Justification), hyphenation, tracking of a few words, or rewrite."
    };
    return fr ? FR : EN;
})();

function APP_f(s, o) { for (var k in o) if (o.hasOwnProperty(k)) s = s.split("{" + k + "}").join(o[k]); return s; }

/* ===================================================================== */
/*  3. ILLUSTRATOR                                                        */
/* ===================================================================== */

function APP_collect(items, out) {
    var i;
    if (!items) return out;
    if (items.typename === "TextRange") { try { out.push(items.story.textFrames[0]); } catch (e) {} return out; }
    for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it) continue;
        if (it.typename === "TextFrame") out.push(it);
        else if (it.typename === "GroupItem") APP_collect(it.pageItems, out);
    }
    return out;
}

function APP_isLocked(it) {
    var p = it;
    try {
        while (p && p.typename !== "Document") {
            if (p.locked === true || p.hidden === true) return true;
            if (p.typename === "Layer" && p.visible === false) return true;
            p = p.parent;
        }
    } catch (e) {}
    return false;
}

function APP_rejectReason(tf) {
    var T = APP_T;
    if (APP_isLocked(tf)) return T.locked;
    try { if (tf.kind === TextType.PATHTEXT) return T.path; } catch (e0) {}
    try { if (tf.orientation === TextOrientation.VERTICAL) return T.vertical; } catch (e1) {}
    try {
        var m = tf.matrix;
        if (Math.abs(m.mValueB) > 1e-4 || Math.abs(m.mValueC) > 1e-4 || m.mValueA <= 0 || m.mValueD <= 0) return T.rotated;
    } catch (e2) {}
    try {
        if (tf.kind === TextType.AREATEXT) {
            var pp = tf.textPath.pathPoints, i, xs = {}, ys = {}, nx = 0, ny = 0;
            if (pp.length === 4) {
                for (i = 0; i < 4; i++) {
                    var x = Math.round(pp[i].anchor[0] * 10), y = Math.round(pp[i].anchor[1] * 10);
                    if (!xs[x]) { xs[x] = true; nx++; }
                    if (!ys[y]) { ys[y] = true; ny++; }
                }
                if (nx !== 2 || ny !== 2) return T.rotated;
            }
        }
    } catch (e3) {}
    if (APP_CORE.lineText(tf.contents).visible === 0) return T.empty;
    return "";
}

function APP_leafBoxes(item, out) {
    var i;
    if (item.typename === "GroupItem") { for (i = 0; i < item.pageItems.length; i++) APP_leafBoxes(item.pageItems[i], out); }
    else if (item.typename === "PathItem" || item.typename === "CompoundPathItem") out.push(APP_CORE.box(item.geometricBounds));
    return out;
}

function APP_justKind(j) {
    try {
        if (j === Justification.FULLJUSTIFY) return "full";
        if (j === Justification.FULLJUSTIFYLASTLINELEFT || j === Justification.FULLJUSTIFYLASTLINERIGHT ||
            j === Justification.FULLJUSTIFYLASTLINECENTER) return "last";
    } catch (e) {}
    return "";
}

// Espace normal d'une police à 100 pt (blanc entre les boîtes de « n n »), en cache.
// A font's normal space at 100 pt (box gap in "n n"), cached.
var APP_gapCache = {};
function APP_normalGap(font, rtl, layer) {
    var key = "", tmp = null, og = null, v = 25;
    try { key = font.name + (rtl ? "|rtl" : ""); } catch (e) { key = "?" + (rtl ? "|rtl" : ""); }
    if (APP_gapCache.hasOwnProperty(key)) return APP_gapCache[key];
    try {
        tmp = layer.textFrames.add();
        tmp.contents = rtl ? "\u0647 \u0647" : "n n";
        var ca = tmp.textRange.characterAttributes;
        try { if (font) ca.textFont = font; } catch (e1) {}
        ca.size = 100; ca.tracking = 0; ca.horizontalScale = 100;
        og = tmp.createOutline(); tmp = null;
        var bx = APP_leafBoxes(og, []);
        bx.sort(function (a, b) { return a.l - b.l; });
        if (bx.length >= 2) {
            var g = bx[bx.length - 1].l - bx[0].r;
            if (g > 5 && g < 90) v = g;
        }
    } catch (e2) {}
    try { if (og) og.remove(); } catch (e3) {}
    try { if (tmp) tmp.remove(); } catch (e4) {}
    APP_gapCache[key] = v;
    return v;
}

// Informations texte de chaque ligne composée / text info for each composed line
function APP_textLines(tf) {
    var res = [], tl, i, story = "";
    try { story = tf.story.textRange.contents; } catch (e) { try { story = tf.contents; } catch (e0) { story = ""; } }
    try { tl = tf.lines; } catch (e1) { return res; }
    for (i = 0; i < tl.length; i++) {
        var L = tl[i], s = "", info = { size: 12, hScale: 100, font: null, leading: 0, just: "", last: false };
        try { s = L.contents; } catch (e2) {}
        var t = APP_CORE.lineText(s);
        info.text = t;
        try {
            var ca = L.characterAttributes;
            info.size = ca.size || 12; info.hScale = ca.horizontalScale || 100;
            info.leading = ca.autoLeading ? info.size * 1.2 : (ca.leading || info.size * 1.2);
            info.font = ca.textFont;
        } catch (e3) {}
        try { info.just = APP_justKind(L.paragraphAttributes.justification); } catch (e4) {}
        try {
            var endCh = s.length ? s.charCodeAt(s.length - 1) : 0;
            var after = L.characterOffset - 1 + L.length;
            info.last = endCh === 13 || endCh === 10 || after >= story.length || story.charCodeAt(after) === 13 || story.charCodeAt(after) === 10;
        } catch (e5) { info.last = (i === tl.length - 1); }
        res.push(info);
    }
    return res;
}

// Cellules (colonnes / rangées) d'un texte captif / cells of an area-type frame
function APP_cells(tf, boxes) {
    var cols = 1, rows = 1, cg = 0, rg = 0, horiz = false, i;
    try { if (tf.kind === TextType.AREATEXT) { cols = tf.columnCount || 1; rows = tf.rowCount || 1; cg = tf.columnGutter || 0; rg = tf.rowGutter || 0; horiz = !!tf.flowLinksHorizontally; } } catch (e) {}
    if (cols * rows <= 1) return [boxes];
    var gb = tf.textPath.geometricBounds, W = gb[2] - gb[0], H = gb[1] - gb[3];
    var cw = (W - (cols - 1) * cg) / cols, rh = (H - (rows - 1) * rg) / rows, cells = [], c, r;
    for (i = 0; i < cols * rows; i++) cells.push([]);
    for (i = 0; i < boxes.length; i++) {
        var b = boxes[i], cx = (b.l + b.r) / 2;
        c = Math.max(0, Math.min(cols - 1, Math.floor((cx - gb[0]) / (cw + cg))));
        r = Math.max(0, Math.min(rows - 1, Math.floor((gb[1] - b.cy) / (rh + rg))));
        cells[horiz ? r * cols + c : c * rows + r].push(b);
    }
    return cells;
}

// Analyse un bloc / analyses one frame
function APP_analyseFrame(tf, o, layer) {
    var C = APP_CORE, dup = null, og = null, boxes = [], i, k;
    var res = { tf: tf, lines: [], rivers: [], mapped: false, error: false, counts: { r: 0, l: 0, t: 0, h: 0 } };
    var TL = APP_textLines(tf), V = [];
    for (i = 0; i < TL.length; i++) if (TL[i].text.visible > 0) V.push(TL[i]);
    try {
        dup = tf.duplicate();
        og = dup.createOutline(); dup = null;
        boxes = C.dropRules(APP_leafBoxes(og, []));
    } catch (e) { res.error = true; }
    try { if (og) og.remove(); } catch (e1) {}
    try { if (dup) dup.remove(); } catch (e2) {}
    if (res.error || !boxes.length) { res.error = true; return res; }

    var minLead = Infinity, defSize = 12;
    for (i = 0; i < V.length; i++) minLead = Math.min(minLead, V[i].leading || V[i].size * 1.2);
    try { defSize = tf.textRange.characterAttributes.size || 12; } catch (e3) {}
    if (minLead === Infinity) minLead = defSize * 1.2;

    var cells = APP_cells(tf, boxes), geo = [], cellOf = [], c;
    for (c = 0; c < cells.length; c++) {
        if (!cells[c].length) continue;
        var g = C.clusterGreedy(cells[c], 0.45 * minLead);
        if (cells.length === 1 && g.length !== V.length && V.length > 0) {
            var bc = C.clusterByCount(cells[c], V.length);
            if (bc && (V.length < 2 || C.minStep(bc) >= 0.5 * minLead)) g = bc;
        }
        for (k = 0; k < g.length; k++) { geo.push(g[k]); cellOf.push(c); }
    }
    res.mapped = (geo.length === V.length);

    var prevCy = null, prevCell = -1;
    for (k = 0; k < geo.length; k++) {
        var gl = geo[k], info = res.mapped ? V[k] : null;
        var tops = [], bots = [], l = Infinity, r = -Infinity;
        for (i = 0; i < gl.length; i++) { tops.push(gl[i].t); bots.push(gl[i].b); l = Math.min(l, gl[i].l); r = Math.max(r, gl[i].r); }
        var size = info ? info.size : defSize, top = C.median(tops), bot = C.median(bots), cy = (top + bot) / 2;
        var gaps = C.lineGaps(gl, info ? info.text.runs.length : null, size);
        if (info) C.assignKinds(gaps, info.text.runs, info.text.rtl);
        var rtl = info ? info.text.rtl : false, font = info ? info.font : null;
        if (!font) { try { font = tf.textRange.characterAttributes.textFont; } catch (e4) {} }
        var normal = APP_normalGap(font, rtl, layer) * size / 100 * ((info ? info.hScale : 100) / 100);
        var L = { gaps: gaps, size: size, top: top, bot: bot, cy: cy, l: l, r: r, cell: cellOf[k],
                  hasTab: info ? info.text.hasTab : false, normal: normal };
        L.stats = C.lineStats(gaps, normal);
        L.brk = (cellOf[k] !== prevCell) || (prevCy !== null && prevCy - cy > 1.8 * Math.max(minLead, size * 1.2));
        prevCy = cy; prevCell = cellOf[k];
        res.lines.push(L);
    }
    // Lignes étirées : texte associé, sinon largeur proche de la plus longue ligne de la cellule.
    // Stretched lines: from text when matched, else width close to the cell's widest line.
    var widest = {};
    for (k = 0; k < res.lines.length; k++) {
        var w = res.lines[k].r - res.lines[k].l, ce = res.lines[k].cell;
        if (!widest[ce] || w > widest[ce]) widest[ce] = w;
    }
    var fJust = "";
    try { fJust = APP_justKind(tf.textRange.paragraphAttributes.justification); } catch (e5) {}
    for (k = 0; k < res.lines.length; k++) {
        var Lk = res.lines[k];
        if (res.mapped) Lk.checkSpacing = C.checkSpacing(V[k].just, V[k].last, o.onlyJust);
        else Lk.checkSpacing = C.checkSpacing(fJust || (o.onlyJust ? "" : "last"), (Lk.r - Lk.l) < 0.95 * widest[Lk.cell], o.onlyJust);
        Lk.cls = C.classify(Lk, o);
        if (Lk.cls.loose) res.counts.l++;
        if (Lk.cls.tight) res.counts.t++;
        res.counts.h += Lk.cls.holes.length;
    }
    if (o.doRivers) {
        res.rivers = C.findRivers(res.lines, { minLines: o.minLines, tol: o.tol / 100, minRatio: o.minRatio });
        res.counts.r = res.rivers.length;
    }
    return res;
}

/* ---- Repères / marks ---- */

function APP_color(doc, r, g, b, cmyk) {
    var c;
    try {
        if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
            c = new CMYKColor(); c.cyan = cmyk[0]; c.magenta = cmyk[1]; c.yellow = cmyk[2]; c.black = cmyk[3];
            return c;
        }
    } catch (e) {}
    c = new RGBColor(); c.red = r; c.green = g; c.blue = b;
    return c;
}

function APP_findLayer(doc) {
    var i;
    try { for (i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === APP_T.layer) return doc.layers[i]; } catch (e) {}
    return null;
}

function APP_markLayer(doc) {
    var L = APP_findLayer(doc);
    if (!L) { L = doc.layers.add(); L.name = APP_T.layer; }
    try { L.locked = false; L.visible = true; L.printable = false; } catch (e) {}
    try { L.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e1) {}
    return L;
}

function APP_clearMarks(doc) {
    var L = APP_findLayer(doc);
    if (!L) return false;
    try { L.locked = false; L.remove(); } catch (e) { return false; }
    return true;
}

function APP_label(layer, x, y, txt, size, col) {
    try {
        var t = layer.textFrames.add();
        t.contents = txt;
        t.textRange.characterAttributes.size = size;
        t.textRange.characterAttributes.fillColor = col;
        t.position = [x, y];
        return 1;
    } catch (e) { return 0; }
}

function APP_drawFrame(res, layer, doc) {
    var n = 0, k, i, p;
    var cR = APP_color(doc, 230, 0, 126, [0, 100, 0, 0]), cL = APP_color(doc, 255, 140, 0, [0, 50, 100, 0]);
    var cT = APP_color(doc, 0, 120, 255, [80, 40, 0, 0]), cH = APP_color(doc, 220, 0, 0, [0, 100, 100, 0]);
    for (k = 0; k < res.lines.length; k++) {
        var L = res.lines[k], cls = L.cls;
        if (cls.loose || cls.tight) {
            var rc = layer.pathItems.rectangle(L.top, L.l, Math.max(L.r - L.l, 1), Math.max(L.top - L.bot, 1));
            rc.filled = true; rc.stroked = false; rc.fillColor = cls.loose ? cL : cT; rc.opacity = 30;
            rc.name = (cls.loose ? APP_T.loose : APP_T.tight) + " " + Math.round(L.stats.mean) + " %";
            n++;
            var fs = Math.max(4, Math.min(8, L.size * 0.6));
            n += APP_label(layer, L.l - fs * 3.2, L.top, Math.round(L.stats.mean) + " %", fs, cls.loose ? cL : cT);
        }
        for (i = 0; i < cls.holes.length; i++) {
            var g = L.gaps[cls.holes[i]];
            var hr = layer.pathItems.rectangle(L.top + 0.5, g.x1, Math.max(g.w, 0.5), Math.max(L.top - L.bot, 1) + 1);
            hr.filled = false; hr.stroked = true; hr.strokeColor = cH; hr.strokeWidth = 0.75;
            hr.name = APP_T.holes + " " + Math.round(g.ratio) + " %";
            n++;
        }
    }
    for (i = 0; i < res.rivers.length; i++) {
        var R = res.rivers[i], pts = [];
        for (p = 0; p < R.pts.length; p++) {
            var Lp = res.lines[R.pts[p].k], gp = Lp.gaps[R.pts[p].g];
            pts.push([(gp.x1 + gp.x2) / 2, Lp.cy]);
        }
        var pa = layer.pathItems.add();
        pa.setEntirePath(pts);
        pa.filled = false; pa.stroked = true; pa.strokeColor = cR;
        pa.strokeWidth = Math.max(0.5, Math.min(6, R.meanW * 0.6));
        try { pa.strokeCap = StrokeCap.ROUNDENDCAP; pa.strokeJoin = StrokeJoin.ROUNDENDJOIN; } catch (e) {}
        pa.opacity = 70;
        pa.name = APP_T.river + " " + R.length + " " + APP_T.lines;
        n++;
    }
    return n;
}

function APP_reportFrame(idx, res) {
    var T = APP_T, s = T.frame + " " + idx + " « " + APP_CORE.excerpt(res.tf.contents, 28) + " » : ";
    if (res.error) return s + T.failed;
    s += res.lines.length + " " + T.lines;
    var parts = [], k, mx = 0, mn = Infinity, lens = [];
    for (k = 0; k < res.rivers.length; k++) lens.push(res.rivers[k].length);
    for (k = 0; k < res.lines.length; k++) {
        var L = res.lines[k];
        if (L.cls.loose && L.stats.mean > mx) mx = L.stats.mean;
        if (L.cls.tight && L.stats.mean < mn) mn = L.stats.mean;
    }
    if (res.counts.r) parts.push(res.counts.r + " " + T.river + " (" + lens.join(", ") + " " + T.lines + ")");
    if (res.counts.l) parts.push(res.counts.l + " " + T.loose + " (" + T.max + " " + Math.round(mx) + " %)");
    if (res.counts.t) parts.push(res.counts.t + " " + T.tight + " (" + T.min + " " + Math.round(mn) + " %)");
    if (res.counts.h) parts.push(res.counts.h + " " + T.holes);
    s += parts.length ? ", " + parts.join(", ") : " — " + T.ok;
    if (!res.mapped) s += " " + T.fallback;
    return s;
}

function APP_run(doc, frames, o, mark, progress) {
    var T = APP_T, out = [], tot = { r: 0, l: 0, t: 0, h: 0 }, n = 0, i, affected = [];
    APP_gapCache = {};
    var hadLayer = !!APP_findLayer(doc);
    if (mark) APP_clearMarks(doc);
    var layer = APP_markLayer(doc);
    for (i = 0; i < frames.length; i++) {
        var res = APP_analyseFrame(frames[i], o, layer);
        out.push(APP_reportFrame(i + 1, res));
        tot.r += res.counts.r; tot.l += res.counts.l; tot.t += res.counts.t; tot.h += res.counts.h;
        if (res.counts.r + res.counts.l + res.counts.t + res.counts.h > 0) {
            affected.push(frames[i]);
            if (mark) n += APP_drawFrame(res, layer, doc);
        }
        if (progress) progress(i + 1);
    }
    if (mark) {
        if (n > 0) { try { layer.locked = true; } catch (e) {} }
        else { try { layer.remove(); } catch (e1) {} }
    } else if (!hadLayer) {
        try { layer.remove(); } catch (e2) {}
    } else { try { layer.locked = true; } catch (e3) {} }
    out.push("");
    out.push(APP_f(T.total, { r: tot.r, l: tot.l, t: tot.t, h: tot.h, f: frames.length }));
    if (mark && n > 0) { out.push(APP_f(T.marked, { n: n, layer: T.layer })); out.push(T.undo); }
    if (tot.r + tot.l + tot.t + tot.h > 0) out.push(T.tipFix);
    return { text: out, affected: affected };
}

/* ===================================================================== */
/*  4. RÉGLAGES ET DIALOGUE / SETTINGS AND DIALOG                         */
/* ===================================================================== */

var APP_DEF = { doRivers: 1, minLines: 3, tol: 10, minRatio: 75, doLoose: 1, loose: 150, doTight: 1, tight: 80,
                doHoles: 1, hole: 250, onlyJust: 1, selectFrames: 0 };

function APP_cfgFile() { return new File(Folder.userData + "/DetecterLezardes.cfg"); }
function APP_loadCfg() {
    var c = {}, k, f = APP_cfgFile();
    for (k in APP_DEF) if (APP_DEF.hasOwnProperty(k)) c[k] = APP_DEF[k];
    try {
        if (f.exists && f.open("r")) {
            var parts = f.read().split("\n"); f.close();
            for (var i = 0; i < parts.length; i++) {
                var kv = parts[i].split("=");
                if (kv.length === 2 && c.hasOwnProperty(kv[0])) c[kv[0]] = APP_CORE.num(kv[1], c[kv[0]]);
            }
        }
    } catch (e) {}
    return c;
}
function APP_saveCfg(c) {
    var f = APP_cfgFile(), s = [], k;
    for (k in APP_DEF) if (APP_DEF.hasOwnProperty(k)) s.push(k + "=" + (typeof c[k] === "boolean" ? (c[k] ? 1 : 0) : c[k]));
    try { if (f.open("w")) { f.write(s.join("\n")); f.close(); } } catch (e) {}
}

function APP_docFrames(doc) {
    var out = [], i;
    try { for (i = 0; i < doc.textFrames.length; i++) out.push(doc.textFrames[i]); } catch (e) {}
    return out;
}

function APP_filter(all, skipped) {
    var ok = [], i, why;
    for (i = 0; i < all.length; i++) {
        why = APP_rejectReason(all[i]);
        if (why) { if (skipped) skipped.push(APP_CORE.excerpt(all[i].contents, 16) + " (" + why + ")"); }
        else ok.push(all[i]);
    }
    return ok;
}

function APP_dialog(doc, selFrames, docFrames) {
    var T = APP_T, cfg = APP_loadCfg(), lastAffected = null;
    var w = new Window("dialog", T.title);
    w.orientation = "column"; w.alignChildren = ["fill", "top"];

    var pS = w.add("panel", undefined, T.scope); pS.orientation = "row"; pS.alignChildren = ["left", "center"];
    var rSel = pS.add("radiobutton", undefined, APP_f(T.scopeSel, { n: selFrames.length }));
    var rDoc = pS.add("radiobutton", undefined, APP_f(T.scopeDoc, { n: docFrames.length }));
    rSel.enabled = selFrames.length > 0;
    rSel.value = selFrames.length > 0; rDoc.value = !rSel.value;

    function numRow(parent, label, val, withCheck, checked) {
        var g = parent.add("group"), cb = null;
        if (withCheck) { cb = g.add("checkbox", undefined, label); cb.value = !!checked; }
        else g.add("statictext", undefined, label);
        var e = g.add("edittext", undefined, String(val)); e.characters = 5;
        return { cb: cb, e: e };
    }

    var pR = w.add("panel", undefined, T.rivers); pR.alignChildren = ["left", "top"];
    var cRiv = pR.add("checkbox", undefined, T.doRivers); cRiv.value = !!cfg.doRivers;
    var eMin = numRow(pR, T.minLines, cfg.minLines).e, eTol = numRow(pR, T.tol, cfg.tol).e, eRat = numRow(pR, T.minRatio, cfg.minRatio).e;

    var pG = w.add("panel", undefined, T.spacing); pG.alignChildren = ["left", "top"];
    var rL = numRow(pG, T.doLoose, cfg.loose, true, cfg.doLoose), rT = numRow(pG, T.doTight, cfg.tight, true, cfg.doTight);
    var rH = numRow(pG, T.doHoles, cfg.hole, true, cfg.doHoles);
    var cJust = pG.add("checkbox", undefined, T.onlyJust); cJust.value = !!cfg.onlyJust;

    var pO = w.add("panel", undefined, T.options); pO.alignChildren = ["left", "top"];
    var cSel = pO.add("checkbox", undefined, T.selectFrames); cSel.value = !!cfg.selectFrames;
    var hint = pO.add("statictext", undefined, T.hint + "\n" + T.copyTip, { multiline: true }); hint.preferredSize = [480, 58];

    var pRep = w.add("panel", undefined, T.report); pRep.alignChildren = ["fill", "top"];
    var rep = pRep.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
    rep.preferredSize = [480, 150];

    var gB = w.add("group"); gB.alignment = ["right", "top"];
    var bA = gB.add("button", undefined, T.analyse), bX = gB.add("button", undefined, T.clear);
    var bM = gB.add("button", undefined, T.mark), bC = gB.add("button", undefined, T.close, { name: "cancel" });

    function opts() {
        var C = APP_CORE;
        var o = { doRivers: cRiv.value, minLines: Math.round(C.num(eMin.text, 3, 2, 50)), tol: C.num(eTol.text, 10, 0, 100),
                  minRatio: C.num(eRat.text, 75, 0, 1000), doLoose: rL.cb.value, loose: C.num(rL.e.text, 150, 100, 1000),
                  doTight: rT.cb.value, tight: C.num(rT.e.text, 80, 0, 100), doHoles: rH.cb.value, hole: C.num(rH.e.text, 250, 100, 2000),
                  onlyJust: cJust.value, selectFrames: cSel.value };
        APP_saveCfg(o);
        return o;
    }
    function runWith(mark) {
        var o = opts(), frames = rSel.value ? selFrames : docFrames;
        if (!frames.length) { rep.text = T.noText; return; }
        var pw = new Window("palette", T.working), pb = pw.add("progressbar", undefined, 0, frames.length);
        pb.preferredSize = [300, 12];
        try { pw.show(); } catch (e0) {}
        var res;
        try { res = APP_run(doc, frames, o, mark, function (n) { pb.value = n; try { pw.update(); } catch (e1) {} }); }
        catch (e) { res = { text: ["Erreur / Error : " + e], affected: [] }; }
        try { pw.close(); } catch (e2) {}
        try { app.redraw(); } catch (e3) {}
        rep.text = res.text.join("\n");
        lastAffected = res.affected;
    }
    bA.onClick = function () { runWith(false); };
    bM.onClick = function () { runWith(true); };
    bX.onClick = function () { rep.text = APP_clearMarks(doc) ? T.cleared : T.noLayer; try { app.redraw(); } catch (e) {} };
    w.show();
    if (cSel.value && lastAffected && lastAffected.length) {
        try { doc.selection = null; for (var i = 0; i < lastAffected.length; i++) lastAffected[i].selected = true; } catch (e4) {}
    }
}

function APP_main() {
    var T = APP_T;
    if (app.documents.length === 0) { alert(T.noDoc); return; }
    var doc = app.activeDocument, skipped = [];
    var selFrames = APP_filter(APP_collect(doc.selection, []), skipped);
    var docFrames = APP_filter(APP_docFrames(doc), null);
    if (!selFrames.length && !docFrames.length) { alert(T.noText + (skipped.length ? "\n" + T.skipped + skipped.join(" ; ") : "")); return; }
    APP_dialog(doc, selFrames, docFrames);
}

if (typeof app !== "undefined" && typeof APP_NO_MAIN === "undefined") {
    try { APP_main(); } catch (e) { alert("DetecterLezardes : " + e); }
}
