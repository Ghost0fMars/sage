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
    cands = [(n, t, g, tx, y) for n, t, g, tx, y in lignes if candidat(t, g, tx) and not courant.search(tx)]
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
        if sortie and sortie[-1][2] == n and sortie[-1][0] == niv and (
                abs(y - sortie[-1][3]) < t * 2.2 or tx[0].islower() and not sortie[-1][1].endswith((".", "?", "!"))):
            sortie[-1][1] += " " + tx  # titre sur plusieurs lignes
            sortie[-1][3] = y
        else:
            sortie.append([niv, tx, n, y])
    plat = [(a, b, c) for a, b, c, _ in sortie]
    # titre de couverture seul au niveau 1 : on le retire et on remonte les niveaux suivants
    for _ in range(2):
        if len(plat) > 12 and sum(a == 1 for a, _, _ in plat) < 4:
            plat = [(max(a - 1, 1), b, c) for a, b, c in plat if a > 1]
    return plat[:400]


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
