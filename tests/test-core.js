// Tests du cœur pur — node tests/test-core.js / Pure-core tests.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "DetecterLezardes.jsx"), "utf8");
var ctx = { APP_NO_MAIN: true }; vm.createContext(ctx); vm.runInContext(src + "\nthis.C = APP_CORE;", ctx);
var C = ctx.C, pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } }
function near(a, b, t) { return Math.abs(a - b) <= (t || 1e-9); }

// Générateur pseudo-aléatoire reproductible / seeded PRNG
var seed = 12345; function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

// lineText
var t = C.lineText("Le  chat\u00A0dort ");
ok("2 séquences d'espaces (double espace = 1)", t.runs.length === 2, t.runs);
ok("espace insécable = ordinaire", t.runs[1].kind === "r");
ok("caractères visibles", t.visible === 10, t.visible);
ok("espaces de début/fin ignorés", C.lineText("  a b  ").runs.length === 1);
ok("espace fine = spéciale", C.lineText("Quoi\u202F?").runs[0].kind === "s");
ok("tabulation repérée", C.lineText("1\t2").hasTab === true);
ok("arabe = RTL", C.lineText("مرحبا بالعالم").rtl === true && C.lineText("Hello world").rtl === false);
ok("ligne vide", C.lineText("\r").visible === 0 && C.lineText(" \u0003").runs.length === 0);
ok("retour forcé ignoré", C.lineText("fin\u0003").runs.length === 0);

// median
ok("médiane impaire/paire", C.median([3, 1, 2]) === 2 && C.median([4, 1, 2, 3]) === 2.5);

// Boîtes de glyphes simulées / simulated glyph boxes
function lineBoxes(words, x0, base, size, gap) {
    var out = [], x = x0, cw = 0.5 * size, lg = 0.06 * size;
    for (var w = 0; w < words.length; w++) {
        for (var c = 0; c < words[w]; c++) {
            var ch = rnd(), t = base + 0.7 * size, b = base;
            if (ch < 0.1) { t = base + 0.1 * size; b = base - 0.15 * size; }       // virgule / comma
            else if (ch < 0.2) { t = base + 0.95 * size; }                        // accent / capitale
            else if (ch < 0.3) { b = base - 0.22 * size; }                        // descendante
            out.push({ l: x, t: t, r: x + cw, b: b, cy: (t + b) / 2 });
            x += cw + (c < words[w] - 1 ? lg : 0);
        }
        if (w < words.length - 1) x += (typeof gap === "function" ? gap(w) : gap);
    }
    return out;
}

// clusterGreedy / clusterByCount
var size = 10, lead = 12, all = [], i, k;
for (k = 0; k < 6; k++) all = all.concat(lineBoxes([4, 6, 3, 5], 0, -k * lead, size, 2.5));
var g = C.clusterGreedy(all, 0.45 * lead);
ok("seuil : 6 lignes retrouvées malgré virgules et accents", g.length === 6, g.length);
var bc = C.clusterByCount(all, 6);
ok("par nombre : 6 lignes", bc && bc.length === 6);
var sizesOk = true; for (k = 0; k < 6; k++) if (bc[k].length !== 18) sizesOk = false;
ok("par nombre : 18 glyphes par ligne", sizesOk);
ok("par nombre : ordre haut → bas", bc[0][0].cy > bc[5][0].cy);
ok("par nombre : pas minimal ≈ interlignage", C.minStep(bc) > 0.5 * lead, C.minStep(bc));
ok("par nombre : null si trop peu de glyphes", C.clusterByCount(all.slice(0, 3), 6) === null);
// Interlignage serré 100 % / solid leading
var tight = []; for (k = 0; k < 5; k++) tight = tight.concat(lineBoxes([5, 5, 5], 0, -k * 10, 10, 2.5));
ok("interlignage 100 % : par nombre exact", C.clusterByCount(tight, 5).length === 5 && C.minStep(C.clusterByCount(tight, 5)) > 5);

// dropRules
var withRule = lineBoxes([4, 4, 4], 0, 0, 10, 2.5).concat([{ l: 0, t: -1, r: 80, b: -1.6, cy: -1.3 }]);
ok("soulignement retiré", C.dropRules(withRule).length === withRule.length - 1);

// lineGaps
var lb = lineBoxes([3, 4, 2, 5], 0, 0, 10, 2.5);
var gaps = C.lineGaps(lb, 3, 10);
ok("3 blancs choisis", gaps.length === 3);
ok("largeur 2,5 pt", near(gaps[0].w, 2.5, 1e-6) && near(gaps[2].w, 2.5, 1e-6), gaps);
ok("ordre gauche → droite", gaps[0].x1 < gaps[1].x1 && gaps[1].x1 < gaps[2].x1);
ok("seuil sans nombre : 3 blancs", C.lineGaps(lb, null, 10).length === 3);
ok("serrée (1,4 pt) toujours > interlettrage", C.lineGaps(lineBoxes([3, 4, 2], 0, 0, 10, 1.4), 2, 10)[0].w > 1);
ok("glyphes qui se chevauchent (italique)", C.lineGaps([{ l: 0, r: 5 }, { l: 4, r: 9 }, { l: 12, r: 15 }], 1, 10)[0].x1 === 9);
ok("une seule boîte = aucun blanc", C.lineGaps([{ l: 0, r: 5 }], 0, 10).length === 0);

// assignKinds
var gk = C.assignKinds([{ x1: 0 }, { x1: 5 }], [{ kind: "r" }, { kind: "s" }], false);
ok("natures LTR", gk[0].kind === "r" && gk[1].kind === "s");
gk = C.assignKinds([{ x1: 0 }, { x1: 5 }], [{ kind: "r" }, { kind: "s" }], true);
ok("natures RTL inversées", gk[0].kind === "s" && gk[1].kind === "r");
gk = C.assignKinds([{ x1: 0 }], [{ kind: "s" }, { kind: "s" }], false);
ok("nombre différent : ordinaire par défaut", gk[0].kind === "r");

// lineStats
var st = C.lineStats([{ w: 2.5, kind: "r" }, { w: 5, kind: "r" }, { w: 1, kind: "s" }], 2.5);
ok("moyenne hors espaces spéciales = 150 %", near(st.mean, 150) && st.n === 2, st);
ok("max / min", near(st.max, 200) && near(st.min, 100));

// classify
var o = { loose: 150, tight: 80, hole: 250, doLoose: true, doTight: true, doHoles: true };
function L(ratios, check, tab) {
    var gs = []; for (var j = 0; j < ratios.length; j++) gs.push({ w: ratios[j] / 100 * 2.5, kind: "r" });
    var l = { gaps: gs, checkSpacing: check, hasTab: !!tab }; l.stats = C.lineStats(gs, 2.5); return l;
}
ok("ligne lâche", C.classify(L([180, 170, 160], true), o).loose === true);
ok("ligne serrée", C.classify(L([70, 75], true), o).tight === true);
ok("ligne normale", !C.classify(L([100, 110], true), o).loose && !C.classify(L([100, 110], true), o).tight);
ok("dernière ligne non contrôlée", C.classify(L([300, 300], false), o).loose === false);
ok("trou détecté même en dernière ligne", C.classify(L([100, 300], false), o).holes.length === 1);
ok("tabulations ignorées", C.classify(L([400], true, true), o).holes.length === 0);
ok("options désactivées", C.classify(L([400, 400], true), { loose: 150, tight: 80, hole: 250 }).loose === false);

// checkSpacing
ok("justifié sauf dernière", C.checkSpacing("last", false, true) && !C.checkSpacing("last", true, true));
ok("justifié tout", C.checkSpacing("full", true, true));
ok("non justifié : seulement si option décochée", !C.checkSpacing("", false, true) && C.checkSpacing("", false, false) && !C.checkSpacing("", true, false));

// findRivers — lézarde verticale fabriquée / built vertical river
function mkLines(spec) { // spec[k] = [[x1,x2], ...]
    var out = []; for (var k = 0; k < spec.length; k++) {
        var gs = []; for (var j = 0; j < spec[k].length; j++) gs.push({ x1: spec[k][j][0], x2: spec[k][j][1], w: spec[k][j][1] - spec[k][j][0], ratio: 120, kind: "r" });
        out.push({ gaps: gs, size: 10, brk: k === 0 });
    } return out;
}
var ro = { minLines: 3, tol: 0.1, minRatio: 75 };
var R = C.findRivers(mkLines([[[10, 13], [40, 43]], [[11, 14], [70, 73]], [[12, 15], [20, 23]], [[12, 15]], [[50, 53]]]), ro);
ok("1 lézarde de 4 lignes", R.length === 1 && R[0].length === 4, R);
ok("points de la lézarde", R[0].pts[0].k === 0 && R[0].pts[3].k === 3);
ok("largeur moyenne", near(R[0].meanW, 3));
R = C.findRivers(mkLines([[[10, 13]], [[13.5, 16]], [[16.5, 19]], [[19.5, 22]]]), ro);
ok("lézarde oblique (tolérance 1 pt)", R.length === 1 && R[0].length === 4);
R = C.findRivers(mkLines([[[10, 13]], [[13.5, 16]], [[16.5, 19]], [[19.5, 22]]]), { minLines: 3, tol: 0, minRatio: 75 });
ok("tolérance 0 : plus de lézarde", R.length === 0);
var br = mkLines([[[10, 13]], [[10, 13]], [[10, 13]], [[10, 13]]]); br[2].brk = true;
ok("coupée par un saut de paragraphe", C.findRivers(br, ro).length === 0);
var nr = mkLines([[[10, 13]], [[10, 13]], [[10, 13]]]); nr[1].gaps[0].ratio = 50;
ok("espaces étroits ignorés", C.findRivers(nr, ro).length === 0);
var sp = mkLines([[[10, 13]], [[10, 13]], [[10, 13]]]); sp[1].gaps[0].kind = "s";
ok("espaces fines ignorées", C.findRivers(sp, ro).length === 0);
// Un-à-un : deux blancs ne peuvent pas suivre le même / one-to-one
R = C.findRivers(mkLines([[[10, 13], [14, 17]], [[12, 15]], [[12, 15]]]), ro);
ok("association un-à-un", R.length === 1 && R[0].length === 3);
ok("minLines 2", C.findRivers(mkLines([[[10, 13]], [[10, 13]]]), { minLines: 2, tol: 0.1, minRatio: 0 }).length === 1);

// Propriétés sur texte aléatoire : chaque lézarde rapportée est valide, aucune omise (force brute)
var valid = true, complete = true;
for (var trial = 0; trial < 200; trial++) {
    var nl = 3 + Math.floor(rnd() * 8), spec = [];
    for (k = 0; k < nl; k++) { var row = [], x = 0; while (x < 200) { x += 10 + rnd() * 30; row.push([x, x + 2 + rnd() * 4]); x += 6; } spec.push(row); }
    var lines = mkLines(spec), res = C.findRivers(lines, ro), used = {};
    for (var r = 0; r < res.length; r++) {
        var p = res[r].pts;
        if (p.length < 3) valid = false;
        for (var q = 0; q < p.length; q++) {
            var key = p[q].k + ":" + p[q].g; if (used[key]) valid = false; used[key] = true;
            if (q) { var A = lines[p[q - 1].k].gaps[p[q - 1].g], B = lines[p[q].k].gaps[p[q].g];
                if (p[q].k !== p[q - 1].k + 1 || Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1) + 1 <= 0) valid = false; }
        }
    }
}
ok("200 textes aléatoires : lézardes valides et sans doublon", valid);
// Injection : une lézarde parfaite est toujours trouvée / an injected perfect river is always found
var found = 0;
for (trial = 0; trial < 100; trial++) {
    spec = [];
    var X = 60 + rnd() * 80;
    for (k = 0; k < 5; k++) { row = []; x = 0; while (x < 200) { x += 25 + rnd() * 30; if (Math.abs(x - X) > 12) row.push([x, x + 2.5]); x += 6; } row.push([X, X + 3]); row.sort(function (u, v) { return u[0] - v[0]; }); spec.push(row); }
    res = C.findRivers(mkLines(spec), ro);
    for (r = 0; r < res.length; r++) if (res[r].length >= 5) { found++; break; }
}
ok("100 lézardes injectées de 5 lignes retrouvées", found === 100, found);

// num / excerpt
ok("nombre avec virgule", C.num("1,5", 0) === 1.5 && C.num("x", 7) === 7 && C.num("500", 0, 0, 100) === 100);
ok("extrait", C.excerpt("Bonjour\rle monde entier", 10) === "Bonjour l…");

console.log("\n" + pass + " réussis, " + fail + " échoués / passed, failed");
process.exit(fail ? 1 : 0);
