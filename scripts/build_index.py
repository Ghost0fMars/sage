"""Indexe les PDF de public/carte/référentiels : sommaire de chaque document + texte par page.

    npm run index-corpus                               # tout (cache par date de modification)
    python scripts/build_index.py "Guides"             # seulement les chemins contenant ce texte

Sorties (dans public/carte/data/) : index.js (arbre + sommaires, lu par la carte), index.json
et texts/<id>.json (texte page par page, lu par app/lib/corpus.ts : carte, assistant, génération).
Sommaire = signets du PDF s'il y en a, sinon titres repérés à la taille/graisse de police.
"""
import collections, hashlib, json, os, re, sys, unicodedata
from pathlib import Path

import pymupdf

RACINE = Path(os.environ.get("INDEX_ROOT") or Path(__file__).resolve().parent.parent / "public" / "carte")  # contient référentiels/
DATA = Path(os.environ.get("INDEX_DATA") or RACINE / "data")
CATEGORIES = {  # dossier → libellé (la couleur de chaque famille est dans index.html)
    "Guides": "Guides", "Repères": "Repères", "Programmes": "Programmes", "Attendus": "Attendus de fin d'année",
    "Fiches thématiques": "Fiches thématiques", "Cartorgraphie": "Cartographies",
}
AUTRES = "Autres référentiels"


def propre(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", t)).strip(" .:·•…_-")


MOT_OUTIL = re.compile(r"(de|des|du|la|le|les|un|une|et|à|au|aux|en|pour|par|sur|l'|d'|dans|avec|ou)$", re.I)
# Les guides pédagogiques suivent un plan type : séquence > focus > étape/temps (même police, donc niveau déduit du libellé)
TYPES = ((re.compile(r"^(proposition de séquence|séquence)\s*n", re.I), 1), (re.compile(r"^focus\s*\d", re.I), 2),
         (re.compile(r"^(étape|temps)\s*\d", re.I), 3))


def NIVEAU_TYPE(titre, niveau):
    return next((n for r, n in TYPES if r.match(titre)), niveau)


def titres_par_police(doc):
    """[(niveau, titre, page)] d'après les tailles de police ; niveaux 1 à 3."""
    lignes, taille_corps = [], collections.Counter()
    for n, page in enumerate(doc, 1):
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                sp = [s for s in l["spans"] if s["text"].strip()]
                if not sp:
                    continue
                texte = propre("".join(s["text"] for s in sp))
                for s in sp:
                    taille_corps[round(s["size"])] += len(s["text"])
                gras = all(s["flags"] & 16 or "bold" in s["font"].lower() for s in sp)
                lignes.append((n, round(max(s["size"] for s in sp)), gras, texte, round(l["bbox"][1])))
    if not lignes:
        return []
    corps = taille_corps.most_common(1)[0][0]

    def candidat(t, g, tx):
        return (4 <= len(tx) <= 110 and not re.fullmatch(r"[\d\W]+", tx) and not tx.endswith((",", ";"))
                and (t >= corps + 2 or (g and t >= corps and len(tx) <= 80 and tx[0].isupper() or re.match(r"\d+(\.\d+)*[.)]? ", tx) and g)))

    # en-têtes courants « 7—Introduction » et titres de la page « Sommaire » elle-même
    courant = re.compile(r"^\d+\s*[—–-]|[—–-]\s*\d+$|^sommaire$", re.I)
    # pages de sommaire : leurs lignes sont des renvois, pas des titres (le vrai titre est indexé à sa page).
    # Marque : beaucoup de numéros de page isolés, ou le mot « Sommaire » avec quelques-uns.
    nums, mot = collections.Counter(), set()
    for n, _, _, tx, _ in lignes:
        nums[n] += bool(re.fullmatch(r"\d{1,3}", tx))
        if re.fullmatch(r"sommaire|table des mati[èe]res", tx, re.I):
            mot.add(n)
    sommaires = {n for n in nums if n <= 20 and (nums[n] >= 6 or n in mot and nums[n] >= 3)}
    cands = [(n, t, g, tx, y) for n, t, g, tx, y in lignes
             if n not in sommaires and candidat(t, g, tx) and not courant.search(tx)]
    freq = collections.Counter(tx for _, _, _, tx, _ in cands)
    cands = [c for c in cands if freq[c[3]] <= 2]  # en-têtes et pieds de page répétés
    styles = collections.Counter((t, g) for _, t, g, _, _ in cands)
    styles = {s: n for s, n in styles.items() if n <= max(60, doc.page_count)}  # trop fréquent = texte courant
    rang = {s: min(i + 1, 3) for i, s in enumerate(sorted(styles, key=lambda s: (-s[0], not s[1])))}
    sortie = []
    for n, t, g, tx, y in cands:
        if (t, g) not in rang:
            continue
        niv = rang[(t, g)]
        prec = sortie[-1] if sortie else None
        # un titre sur plusieurs lignes : ligne suivante rapprochée, et soit elle commence en minuscule,
        # soit la précédente s'arrête sur un mot-outil ou remplit la largeur ; deux titres distincts ne fusionnent pas
        suite = (prec and prec[2] == n and prec[0] == niv and y - prec[3] < t * 1.8 and len(prec[1] + tx) <= 130 and (
            tx[0].islower() and not prec[1].endswith((".", "?", "!", ":"))
            or MOT_OUTIL.search(prec[1]) or len(prec[1]) >= 55 and not prec[1].endswith((".", "?", "!", ":"))
        ))
        if suite:
            prec[1] += " " + tx
            prec[3] = y
        elif tx[0].islower() and not re.match(r"\d", tx):
            continue  # début de phrase ou fragment : pas un titre
        else:
            sortie.append([niv, tx, n, y])
    plat = [(a, b, c) for a, b, c, _ in sortie if len(b) <= 110]
    # titre de couverture seul au niveau 1 : on le retire et on remonte les niveaux suivants
    for _ in range(2):
        if len(plat) > 12 and sum(a == 1 for a, _, _ in plat) < 4:
            plat = [(max(a - 1, 1), b, c) for a, b, c in plat if a > 1]
    if any(TYPES[0][0].match(b) for _, b, _ in plat):  # guide à séquences : tout le reste se range en dessous
        plat = [(a if TYPES[0][0].match(b) else max(a, 2), b, c) for a, b, c in plat]
        return [(4 if TYPES[2][0].match(b) else 3 if TYPES[1][0].match(b) else a, b, c) for a, b, c in plat][:400]
    return [(NIVEAU_TYPE(b, a), b, c) for a, b, c in plat][:400]


def sommaire(doc):
    toc = [(l, propre(t), p) for l, t, p in doc.get_toc() if propre(t)]
    if len(toc) >= 3:
        return [(min(l, 3), t, max(p, 1)) for l, t, p in toc][:400], "signets"
    return titres_par_police(doc), "police"


def arbre(plat):
    """[(niv, titre, page)] → liste imbriquée {t, p, c:[…]} ; un saut de niveau est rattaché au parent le plus proche."""
    racine, pile = [], []
    for niv, t, p in plat:
        noeud = {"t": t, "p": p, "c": []}
        while pile and pile[-1][0] >= niv:
            pile.pop()
        (pile[-1][1]["c"] if pile else racine).append(noeud)
        pile.append((niv, noeud))
    return racine


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    filtre = argv[0] if argv else ""
    (DATA / "texts").mkdir(parents=True, exist_ok=True)
    cache_f = DATA / "index.json"
    cache = json.loads(cache_f.read_text("utf-8")) if cache_f.exists() else {}
    docs = {}
    for pdf in sorted(((RACINE / "référentiels") if (RACINE / "référentiels").is_dir() else RACINE).rglob("*.pdf")):
        rel = pdf.relative_to(RACINE).as_posix()
        id_ = hashlib.md5(rel.encode()).hexdigest()[:10]
        racine = rel.split("/")[0] if rel.count("/") == 1 and rel.startswith("Cart") else rel.split("/")[1] if rel.count("/") >= 2 else ""
        cat = CATEGORIES.get(rel.split("/")[0] if rel.startswith("Cart") else racine, AUTRES)
        sous = "/".join(rel.split("/")[2:-1]) if rel.count("/") > 2 else ""
        mtime = pdf.stat().st_mtime
        ancien = cache.get(id_)
        if ancien and ancien["mtime"] == mtime and filtre not in rel and (DATA / "texts" / f"{id_}.json").exists():
            docs[id_] = ancien
            continue
        if filtre and filtre not in rel and ancien:
            docs[id_] = ancien
            continue
        try:
            doc = pymupdf.open(pdf)
            plat, source = sommaire(doc)
            pages = [p.get_text() for p in doc]
        except Exception as e:  # PDF illisible : on le garde dans la carte, sans sommaire
            print("ERREUR", rel, e)
            plat, source, pages = [], "erreur", []
        (DATA / "texts" / f"{id_}.json").write_text(json.dumps(pages, ensure_ascii=False), "utf-8")
        titre = re.sub(r"^\d+ - ", "", pdf.stem).replace("_", "'")
        docs[id_] = {"id": id_, "titre": titre, "chemin": rel, "cat": cat, "sous": sous,
                     "pages": len(pages), "source": source, "sommaire": arbre(plat), "mtime": mtime}
        print(f"{source:8} {len(plat):4}  {rel[:80]}")
    for f in (DATA / "texts").glob("*.json"):  # textes de PDF retirés ou renommés
        if f.stem not in docs:
            f.unlink()
    cache_f.write_text(json.dumps(docs, ensure_ascii=False), "utf-8")
    (DATA / "index.js").write_text("window.INDEX=" + json.dumps(list(docs.values()), ensure_ascii=False) + ";", "utf-8")
    vides = [d["chemin"] for d in docs.values() if not d["sommaire"]]
    print(f"{len(docs)} documents, {len(vides)} sans sommaire")


if __name__ == "__main__":
    main()
