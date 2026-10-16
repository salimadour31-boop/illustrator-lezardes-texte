// Simulation des objets Illustrator (blocs, lignes, double, vectorisation, calques).
// Ne remplace pas un essai réel. / Simulated Illustrator objects — not a substitute for a real test.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "DetecterLezardes.jsx"), "utf8");
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } }

var Justification = { LEFT: 0, RIGHT: 1, CENTER: 2, FULLJUSTIFY: 3, FULLJUSTIFYLASTLINELEFT: 4, FULLJUSTIFYLASTLINERIGHT: 5, FULLJUSTIFYLASTLINECENTER: 6 };
var TextType = { POINTTEXT: 0, AREATEXT: 1, PATHTEXT: 2 }, TextOrientation = { HORIZONTAL: 0, VERTICAL: 1 };
var alive = { outlines: 0, get temps() { var n = 0; allLayers.forEach(function (L) { L.items.forEach(function (i) { if (i.contents === "n n" || i.contents === "\u0647 \u0647") n++; }); }); return n; } };
var allLayers = [];
var FONT = { name: "SimSans", space: 0.25 }; // espace normal = 0,25 corps (blanc entre boîtes) / normal space

function group(boxes) {
    alive.outlines++;
    var g = { typename: "GroupItem", pageItems: [], removed: false, remove: function () { if (!g.removed) { g.removed = true; alive.outlines--; } } };
    for (var i = 0; i < boxes.length; i++) g.pageItems.push({ typename: i % 3 ? "PathItem" : "CompoundPathItem", geometricBounds: boxes[i] });
    // Imbrication comme Illustrator (groupe dans groupe) / nesting
    return { typename: "GroupItem", pageItems: [g], remove: g.remove };
}

function mkLayer(doc, name) {
    var L = { typename: "Layer", name: name || "Calque", locked: false, visible: true, printable: true, items: [], parent: doc, removed: false };
    L.zOrder = function () {}; allLayers.push(L);
    L.remove = function () { if (L.locked) throw new Error("locked"); L.removed = true; doc.layers.splice(doc.layers.indexOf(L), 1); };
    L.textFrames = { add: function () {
        var t = { contents: "", position: [0, 0], textRange: { characterAttributes: { size: 12, textFont: null } }, kept: true };
        function drop() { var i = L.items.indexOf(t); if (i >= 0) L.items.splice(i, 1); }
        t.createOutline = function () {
            drop(); t.kept = false;
            var s = t.textRange.characterAttributes.size, f = t.textRange.characterAttributes.textFont || FONT, cw = 0.5 * s;
            var g = f.space * s;
            return group([[0, 0.7 * s, cw, 0], [cw + g, 0.7 * s, 2 * cw + g, 0]]);
        };
        t.remove = function () { drop(); t.kept = false; };
        // Les étiquettes restent sur le calque / labels stay on the layer
        L.items.push(t);
        return t;
    } };
    L.pathItems = {
        rectangle: function (top, left, w, h) { var p = { kind: "rect", top: top, left: left, w: w, h: h }; L.items.push(p); return p; },
        add: function () { var p = { kind: "path", setEntirePath: function (pts) { p.pts = pts; } }; L.items.push(p); return p; }
    };
    return L;
}

function mkDoc(cmyk) {
    var doc = { typename: "Document", documentColorSpace: cmyk ? 1 : 0, layers: [], textFrames: [], selection: [] };
    doc.layers.add = function () { var L = mkLayer(doc); doc.layers.unshift(L); return L; };
    doc.layers.push(mkLayer(doc, "Calque 1"));
    return doc;
}

// Composition simulée : coupe gloutonne des mots dans la largeur, justification par les espaces.
// Simulated composition: greedy line breaking, justification by word spaces.
function mkFrame(doc, o) {
    var size = o.size || 10, lead = o.lead || size * 1.2, cw = 0.5 * size, lg = 0.06 * size, ns = FONT.space * size;
    var W = o.width || 100, cols = o.cols || 1, gut = o.gutter || 10, colW = (W - (cols - 1) * gut) / cols;
    var just = o.just === undefined ? Justification.FULLJUSTIFYLASTLINELEFT : o.just;
    var top = o.top || 0, x0 = o.x || 0;
    function wordW(n) { return n * cw + (n - 1) * lg; }
    var lines = [], story = "", expect = [];
    for (var p = 0; p < o.paras.length; p++) {
        var words = o.paras[p], cur = [], curW = 0, pl = [];
        for (var w = 0; w < words.length; w++) {
            var ww = wordW(words[w].length);
            if (cur.length && curW + ns + ww > colW) { pl.push(cur); cur = []; curW = 0; }
            curW += (cur.length ? ns : 0) + ww; cur.push(words[w]);
        }
        if (cur.length) pl.push(cur);
        for (var k = 0; k < pl.length; k++) pl[k] = { words: pl[k], last: k === pl.length - 1 };
        lines = lines.concat(pl);
        if (o.forceLines && p === 0) {}
    }
    // Positions / layout
    var perCol = o.linesPerCol || 1e9, boxes = [], tl = [], off = 1;
    var pIdx = 0, pStart = 0;
    for (var i = 0, li = 0; i < lines.length; i++) {
        var L = lines[i], col = Math.floor(i / perCol), row = i % perCol;
        var base = top - 0.8 * size - row * lead, x = x0 + col * (colW + gut);
        var nat = 0, n = L.words.length;
        for (w = 0; w < n; w++) nat += wordW(L.words[w].length);
        var stretch = (just === Justification.FULLJUSTIFY || (just >= 4 && !L.last)) && n > 1;
        var gap = stretch ? (colW - nat) / (n - 1) : ns;
        expect.push({ ratio: n > 1 ? gap / ns * 100 : 0, stretched: stretch, last: L.last, n: n });
        for (w = 0; w < n; w++) {
            var word = L.words[w];
            for (var c = 0; c < word.length; c++) {
                var ch = word.charAt(c), b = base, t = base + 0.7 * size;
                if (ch === "p" || ch === "g") b = base - 0.22 * size;
                if (ch === "É" || ch === "l") t = base + 0.95 * size;
                if (ch === ",") { t = base + 0.1 * size; b = base - 0.15 * size; }
                if (!o.hideFrom || i < o.hideFrom) boxes.push([x, t, x + cw, b]);
                x += cw + (c < word.length - 1 ? lg : 0);
            }
            if (w < n - 1) x += gap;
        }
        var sep = o.sepFor ? o.sepFor(i) : " ";
        var contents = L.words.join(sep) + (L.last ? "" : " ");
        tl.push({ contents: contents, characterOffset: off, length: contents.length,
                  characterAttributes: { size: size, horizontalScale: 100, autoLeading: false, leading: lead, textFont: FONT },
                  paragraphAttributes: { justification: just } });
        story += contents + (L.last && i < lines.length - 1 ? "\r" : "");
        off += contents.length + (L.last ? 1 : 0);
    }
    if (o.extraTextLine) tl.push({ contents: "débordement caché", characterOffset: off, length: 17, characterAttributes: tl[0].characterAttributes, paragraphAttributes: tl[0].paragraphAttributes });
    var bottom = top - 1000;
    var tf = {
        typename: "TextFrame", kind: o.kind === undefined ? TextType.AREATEXT : o.kind, orientation: TextOrientation.HORIZONTAL,
        locked: !!o.locked, hidden: false, parent: doc.layers[doc.layers.length - 1], contents: story, lines: tl,
        story: { textRange: { contents: story } }, columnCount: cols, rowCount: 1, columnGutter: gut, rowGutter: 0, flowLinksHorizontally: false,
        matrix: o.matrix || { mValueA: 1, mValueB: 0, mValueC: 0, mValueD: 1 },
        textRange: { characterAttributes: { size: size, textFont: FONT }, paragraphAttributes: { justification: just } },
        textPath: { geometricBounds: [x0, top, x0 + W, bottom], pathPoints: o.points || [{ anchor: [x0, top] }, { anchor: [x0 + W, top] }, { anchor: [x0 + W, bottom] }, { anchor: [x0, bottom] }] },
        geometricBounds: [x0, top, x0 + W, bottom], _expect: expect
    };
    tf.duplicate = function () { return { createOutline: function () { return group(boxes); }, remove: function () {} }; };
    doc.textFrames.push(tf);
    return tf;
}

function load(doc) {
    var ctx = { APP_NO_MAIN: true, app: { documents: [doc], activeDocument: doc, redraw: function () {} }, $: { locale: "fr_FR" },
                TextType: TextType, TextOrientation: TextOrientation, Justification: Justification,
                DocumentColorSpace: { RGB: 0, CMYK: 1 }, ZOrderMethod: { BRINGTOFRONT: 0 }, StrokeCap: { ROUNDENDCAP: 1 }, StrokeJoin: { ROUNDENDJOIN: 1 },
                RGBColor: function () { this.t = "rgb"; }, CMYKColor: function () { this.t = "cmyk"; },
                File: function () { this.exists = false; this.open = function () { return false; }; }, Folder: { userData: "/tmp" }, alert: function () {} };
    vm.createContext(ctx); vm.runInContext(src, ctx);
    return ctx;
}
var O = { doRivers: true, minLines: 3, tol: 10, minRatio: 75, doLoose: true, loose: 150, doTight: true, tight: 80, doHoles: true, hole: 250, onlyJust: true };

// Texte courant aléatoire / random running text
var seed = 7; function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
var letters = "aeinrstulodcmpvgqbfhjxyz";
function words(n) { var out = []; for (var i = 0; i < n; i++) { var l = 1 + Math.floor(rnd() * 9), s = ""; for (var j = 0; j < l; j++) s += letters.charAt(Math.floor(rnd() * letters.length)); out.push(s); } return out; }

// 1. Cohérence avec la composition simulée sur 40 blocs aléatoires
var agree = true, mappedAll = true, nLoose = 0, details = null;
for (var trial = 0; trial < 40; trial++) {
    var doc = mkDoc(), tf = mkFrame(doc, { paras: [words(30 + Math.floor(rnd() * 40)), words(10 + Math.floor(rnd() * 20))], width: 80 + rnd() * 120, size: 8 + rnd() * 6 });
    var X = load(doc), res = X.APP_analyseFrame(tf, O, doc.layers[0]);
    if (!res.mapped) mappedAll = false;
    for (var k = 0; k < res.lines.length; k++) {
        var e = tf._expect[k], L = res.lines[k];
        var wantLoose = e.stretched && !e.last && e.n > 1 && e.ratio > 150;
        if (L.cls.loose !== wantLoose) { agree = false; details = { trial: trial, k: k, e: e, mean: L.stats.mean }; }
        if (e.n > 1 && Math.abs(L.stats.mean - e.ratio) > 0.5) { agree = false; details = { trial: trial, k: k, e: e, mean: L.stats.mean }; }
        if (L.cls.loose) nLoose++;
    }
}
ok("40 blocs : lignes associées au texte", mappedAll);
ok("40 blocs : rapport espace / normal exact et lignes lâches = composition", agree, details);
ok("des lignes lâches ont bien été trouvées", nLoose > 0, nLoose);
ok("aucun contour ni texte temporaire restant", alive.outlines === 0 && alive.temps === 0, alive);

// 2. Lézardes fabriquées : mots de même longueur → espaces superposés
doc = mkDoc();
var same = []; for (k = 0; k < 20; k++) same.push("abcd");
tf = mkFrame(doc, { paras: [same], width: 95, size: 10 });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("5 lignes de 4 mots", res.lines.length === 5, res.lines.length);
ok("3 lézardes de 5 lignes", res.rivers.length === 3 && res.rivers[0].length === 5 && res.rivers[2].length === 5, res.rivers.map(function (r) { return r.length; }));
ok("pas de ligne lâche (≈ 104 %)", res.counts.l === 0);
var O2 = JSON.parse(JSON.stringify(O)); O2.minLines = 6;
ok("minLines 6 : aucune", X.APP_analyseFrame(tf, O2, doc.layers[0]).rivers.length === 0);

// 3. Ligne très lâche et trou
doc = mkDoc();
tf = mkFrame(doc, { paras: [["abcdefgh", "ab", "abcdefghijklmnop", "abcdef", "ab", "abc"]], width: 100, size: 10 });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("ligne étirée lâche + trous", res.counts.l >= 1 && res.counts.h >= 1, res.counts);
ok("dernière ligne non comptée lâche", !res.lines[res.lines.length - 1].cls.loose);

// 4. Texte aligné à gauche : lignes lâches non contrôlées, mais double espace = trou
doc = mkDoc();
tf = mkFrame(doc, { paras: [words(40)], width: 120, just: Justification.LEFT });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("fer à gauche : aucune ligne lâche", res.counts.l === 0 && res.counts.t === 0);
var O3 = JSON.parse(JSON.stringify(O)); O3.onlyJust = false; O3.tight = 99.9;
ok("fer à gauche, option décochée : espaces normaux non serrés", X.APP_analyseFrame(tf, O3, doc.layers[0]).counts.t === 0);

// 5. Espaces fines : exclues de la moyenne
doc = mkDoc();
tf = mkFrame(doc, { paras: [words(30)], width: 120, sepFor: function (i) { return i === 0 ? "\u202F" : " "; } });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("ligne 1 : espaces spéciales hors statistiques", res.lines[0].stats.n === 0 && res.lines[1].stats.n > 0, res.lines[0].stats);

// 6. Lignes de texte sans contour (débordement) : détection par seuil
doc = mkDoc();
tf = mkFrame(doc, { paras: [same], width: 95, size: 10, extraTextLine: true });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("non associé → repli", res.mapped === false && res.lines.length === 5, { m: res.mapped, n: res.lines.length });
ok("repli : lézardes toujours trouvées", res.rivers.length === 3);

// 7. Deux colonnes
doc = mkDoc();
tf = mkFrame(doc, { paras: [same.concat(same)], width: 200, cols: 2, gutter: 10, size: 10, linesPerCol: 5 });
X = load(doc); res = X.APP_analyseFrame(tf, O, doc.layers[0]);
ok("2 colonnes : 10 lignes associées", res.lines.length === 10 && res.mapped, { n: res.lines.length, m: res.mapped });
ok("2 colonnes : lézardes séparées par colonne (6 × 5 lignes)", res.rivers.length === 6 && res.rivers[5].length === 5, res.rivers.map(function (r) { return r.length; }));

// 8. Rejets
doc = mkDoc(); X = load(doc);
ok("pivoté rejeté", X.APP_rejectReason(mkFrame(doc, { paras: [same], matrix: { mValueA: 0.7, mValueB: 0.7, mValueC: -0.7, mValueD: 0.7 } })) !== "");
ok("cadre non rectangulaire droit rejeté", X.APP_rejectReason(mkFrame(doc, { paras: [same], points: [{ anchor: [0, 0] }, { anchor: [70, 70] }, { anchor: [140, 0] }, { anchor: [70, -70] }] })) !== "");
ok("curviligne rejeté", X.APP_rejectReason(mkFrame(doc, { paras: [same], kind: TextType.PATHTEXT })) !== "");
ok("verrouillé rejeté", X.APP_rejectReason(mkFrame(doc, { paras: [same], locked: true })) !== "");
ok("vide rejeté", X.APP_rejectReason(mkFrame(doc, { paras: [[]] })) !== "");
ok("bloc normal accepté", X.APP_rejectReason(mkFrame(doc, { paras: [same] })) === "");

// 9. Analyser / Marquer / Effacer
doc = mkDoc();
var f1 = mkFrame(doc, { paras: [same], width: 95 }), f2 = mkFrame(doc, { paras: [["abcdefgh", "ab", "abcdefghijklmnop", "abcdef", "ab", "abc"]], width: 100, x: 200 });
X = load(doc);
var r = X.APP_run(doc, [f1, f2], O, false, null);
ok("Analyser : aucun calque laissé", doc.layers.length === 1, doc.layers.map(function (l) { return l.name; }));
ok("Analyser : rapport avec total", /Total : 3 lézarde/.test(r.text.join("\n")), r.text);
ok("Analyser : 2 blocs concernés", r.affected.length === 2);
r = X.APP_run(doc, [f1, f2], O, true, null);
var ML = doc.layers[0];
ok("Marquer : calque de contrôle non imprimable et verrouillé", ML.name === X.APP_T.layer && ML.printable === false && ML.locked === true);
var paths = ML.items.filter(function (i) { return i.kind === "path"; }), rects = ML.items.filter(function (i) { return i.kind === "rect"; });
ok("Marquer : 3 tracés de lézarde", paths.length === 3 && paths[0].pts.length === 5);
ok("Marquer : rectangles lignes lâches et trous", rects.length >= 2);
ok("Marquer : nombre de repères annoncé", new RegExp(ML.items.length + " repère").test(r.text.join("\n")), [ML.items.length, r.text]);
r = X.APP_run(doc, [f1, f2], O, true, null);
ok("Remarquer : pas d'accumulation", doc.layers.length === 2 && doc.layers[0].items.length === ML.items.length);
ok("Effacer les repères", X.APP_clearMarks(doc) === true && doc.layers.length === 1 && X.APP_clearMarks(doc) === false);
ok("toujours aucun contour restant", alive.outlines === 0 && alive.temps === 0, alive);

// 10. Document CMJN, rien à signaler
doc = mkDoc(true);
var clean = mkFrame(doc, { paras: [["un", "deux", "trois"]], width: 300, just: Justification.LEFT });
X = load(doc); r = X.APP_run(doc, [clean], O, true, null);
ok("rien à signaler : pas de calque", doc.layers.length === 1 && /rien à signaler/.test(r.text[0]), r.text);
ok("couleur CMJN", X.APP_color(doc, 1, 2, 3, [0, 100, 0, 0]).t === "cmyk");

// 11. Dialogue anglais / English strings
var ctxEn = { APP_NO_MAIN: true, $: { locale: "en_US" } }; vm.createContext(ctxEn); vm.runInContext(src, ctxEn);
ok("textes anglais", ctxEn.APP_T.mark === "Mark" && ctxEn.APP_T.layer.indexOf("Rivers") === 0);

console.log("\n" + pass + " réussis, " + fail + " échoués / passed, failed");
process.exit(fail ? 1 : 0);
