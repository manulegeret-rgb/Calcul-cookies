import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Cookie, Package, Calculator, Bolt, Droplets, HandCoins, RotateCcw } from "lucide-react";
import logo from "@/assets/logo.png";

/* ================= Types & helpers ================= */
type Unit = "g" | "ml" | "pc";
type Ingredient = {
  name: string;
  unit: Unit;
  gramsPerUnit: number;   // conversion -> g (pc = poids moyen en g)
  baseQty: number;        // quantité de base (en unité ci-dessus) — sert de référence
  unitPrice: number;      // PRIX UNITAIRE STOCKÉ (€/g, €/ml ou €/pc)
};

const isNum = (x: unknown) => Number.isFinite(x as number);
const nz = (n: number, def = 0) => (isNum(n) ? (n as number) : def);
const euro = (n: number) =>
  isNum(n) ? (n as number).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—";
const fixed = (n: number, d = 0) => (isNum(n) ? (n as number).toFixed(d) : "0");
const toPosNumber = (s: string, def = 0) => {
  const n = Number((s || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : def;
};

/* ============ Storage key (invalide l'ancien cache) ============ */
const LS_KEY = "cookies-cost-calculator-v12";

/* ============ Recette de base (PRIX & QUANTITÉS À JOUR) ============ */
/* Interprétation :
   - baseQty en g/ml/pc (recette de base)
   - unitPrice pour g/ml = €/g (ex: 7,50 €/kg => 0,00750 €/g)
   - unitPrice pour pc = €/pièce
*/
const lockedIngredients: Ingredient[] = [
  { name: "Œuf",                 unit: "pc", gramsPerUnit: 55,  baseQty: 1,   unitPrice: 0.25 },     // 0,25 € / pièce
  { name: "Beurre doux",         unit: "g",  gramsPerUnit: 1,   baseQty: 85,  unitPrice: 0.0075 },   // 7,50 €/kg
  { name: "Sucre",               unit: "g",  gramsPerUnit: 1,   baseQty: 85,  unitPrice: 0.0015 },   // 1,50 €/kg
  { name: "Farine",              unit: "g",  gramsPerUnit: 1,   baseQty: 150, unitPrice: 0.00085 },  // 0,85 €/kg
  { name: "Pépites de chocolat", unit: "g",  gramsPerUnit: 1,   baseQty: 100, unitPrice: 0.02 },     // 20,00 €/kg
  { name: "Sucre vanillé",       unit: "g",  gramsPerUnit: 1,   baseQty: 8,   unitPrice: 0.03 },     // 30,00 €/kg
  { name: "Levure chimique",     unit: "g",  gramsPerUnit: 1,   baseQty: 4,   unitPrice: 0.00845 },  // 8,45 €/kg
  { name: "Sel fin",             unit: "g",  gramsPerUnit: 1,   baseQty: 4,   unitPrice: 0.001 },    // 1,00 €/kg
];

/* ============ Paramètres par défaut ============ */
const defaultParams = {
  cookieWeight: 100,     // g/cookie
  cookiesWanted: 12,     // nb cookies
  lossPctFixed: 3,       // pertes 3% (fixe, non affiché)
  kwhPerBase: 1.2,
  kwhPrice: 0.25,
  litersPerBase: 0.02,
  waterPricePerM3: 4.0,
  laborMinPerBase: 45,
  laborHourly: 20,
  packCostPerCookie: 0.10,
  overheadPct: 10,
  marginPct: 30,
  vatPct: 5.5,
};

export default function App() {
  const [ingredients, setIngredients] = useState<Ingredient[]>(lockedIngredients);

  // Poids & quantité (anti-NaN pendant la saisie)
  const [cookieWeightStr, setCookieWeightStr] = useState<string>(String(defaultParams.cookieWeight));
  const [cookiesWantedStr, setCookiesWantedStr] = useState<string>(String(defaultParams.cookiesWanted));

  // Autres paramètres
  const [p, setP] = useState({ ...defaultParams });

  /* ===== Load storage (recharge unitPrice + inputs + params) ===== */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ingredients && Array.isArray(parsed.ingredients) && parsed.ingredients.length === lockedIngredients.length) {
          const merged = lockedIngredients.map((base, i) => {
            const up = Number(parsed.ingredients[i]?.unitPrice);
            return { ...base, unitPrice: Number.isFinite(up) && up > 0 ? up : base.unitPrice };
          });
          setIngredients(merged);
        }
        if (parsed.p && typeof parsed.p === "object") {
          setCookieWeightStr(String(parsed.p.cookieWeight ?? defaultParams.cookieWeight));
          setCookiesWantedStr(String(parsed.p.cookiesWanted ?? defaultParams.cookiesWanted));
          setP((prev) => ({ ...prev, ...parsed.p }));
        }
      }
    } catch {}
  }, []);

  /* ===== Save storage ===== */
  useEffect(() => {
    const lightIngs = ingredients.map(({ unitPrice }) => ({ unitPrice: nz(unitPrice, 0) }));
    const save = {
      p: { ...p, cookieWeight: toPosNumber(cookieWeightStr, defaultParams.cookieWeight), cookiesWanted: toPosNumber(cookiesWantedStr, defaultParams.cookiesWanted) },
      ingredients: lightIngs,
    };
    const t = setTimeout(() => localStorage.setItem(LS_KEY, JSON.stringify(save)), 120);
    return () => clearTimeout(t);
  }, [ingredients, p, cookieWeightStr, cookiesWantedStr]);

  const resetAll = () => {
    setIngredients(lockedIngredients);
    setCookieWeightStr(String(defaultParams.cookieWeight));
    setCookiesWantedStr(String(defaultParams.cookiesWanted));
    setP({ ...defaultParams });
    localStorage.removeItem(LS_KEY);
  };

  /* ================== Nombres dérivés ================== */
  const cookieWeight = toPosNumber(cookieWeightStr, defaultParams.cookieWeight);
  const cookiesWanted = toPosNumber(cookiesWantedStr, defaultParams.cookiesWanted);

  // Masse totale (g) de la recette de base
  const baseTotalGrams = useMemo(
    () => nz(ingredients.reduce((sum, ing) => sum + nz(ing.baseQty) * nz(ing.gramsPerUnit), 0)),
    [ingredients]
  );

  // Pâte totale visée (g)
  const desiredTotalGrams = nz(cookieWeight * cookiesWanted);

  // Facteur d’échelle avec 3% pertes (non affiché)
  const scale = baseTotalGrams > 0
    ? nz(desiredTotalGrams / baseTotalGrams) / (1 - nz(p.lossPctFixed) / 100)
    : 0;

  // Quantités calculées et coût matières
  const mat = useMemo(() => {
    let totalCost = 0;
    const rows = ingredients.map((ing) => {
      const neededQty = nz(ing.baseQty) * nz(scale);          // en unité d’entrée (g/ml/pc)
      const neededGrams = neededQty * ing.gramsPerUnit;       // pour info pâte
      const cost = neededQty * nz(ing.unitPrice, 0);          // unitPrice est €/g ou €/pc
      totalCost += cost;
      return { ...ing, neededQty, neededGrams, cost };
    });
    return { rows, totalCost: nz(totalCost) };
  }, [ingredients, scale]);

  // Total pâte réellement nécessaire (somme des neededGrams)
  const totalDoughGrams = useMemo(
    () => mat.rows.reduce((s, r) => s + nz(r.neededGrams), 0),
    [mat.rows]
  );

  // Énergie / Eau proportionnelles à l’échelle; MO fixe par session (modifiable si besoin)
  const energyTotal = nz(p.kwhPerBase) * nz(p.kwhPrice) * nz(scale);
  const waterTotal  = nz(p.litersPerBase) * (nz(p.waterPricePerM3) / 1000) * nz(scale);
  const laborTotal  = (nz(p.laborMinPerBase) / 60) * nz(p.laborHourly);

  // Emballage
  const packTotal = nz(p.packCostPerCookie) * Math.max(0, cookiesWanted);

  // Totaux
  const variableSubtotal = nz(mat.totalCost + energyTotal + waterTotal + laborTotal + packTotal);
  const overheadAmount   = nz(variableSubtotal * nz(p.overheadPct) / 100);
  const totalCost        = nz(variableSubtotal + overheadAmount);
  const unitCost         = cookiesWanted > 0 ? nz(totalCost / cookiesWanted) : 0;
  const priceHT  = (1 - nz(p.marginPct) / 100) > 0 ? nz(unitCost / (1 - nz(p.marginPct) / 100)) : 0;
const priceTTC = nz(priceHT * (1 + nz(p.vatPct) / 100));

// --- NOUVEAU : marge nette (HT)
const marginPerCookieHT = nz(priceHT - unitCost); // marge par cookie, hors TVA
const marginPctActual = priceHT > 0 ? (marginPerCookieHT / priceHT) * 100 : 0; // % réel de marge sur HT (info)
const marginTotalHT = marginPerCookieHT * Math.max(0, cookiesWanted);

  // Met à jour unitPrice depuis l’éditeur (€/kg si g/ml, €/pièce si pc)
  const updateUnitPriceFromDisplay = (i: number, valueStr: string, unit: Unit) => {
    const v = toPosNumber(valueStr, 0);
    const next = [...ingredients];
    next[i] = { ...next[i], unitPrice: unit === "pc" ? v : v / 1000 }; // g/ml: €/kg -> €/g
    setIngredients(next);
  };

  /* ================== UI ================== */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Cookie Calculator" className="h-10 w-10" />
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
              Calculateur de coût — Cookies
            </h1>
          </div>
          <Button onClick={resetAll} variant="outline" size="sm" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Réinitialiser</span>
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr] lg:gap-8">
          {/* Colonne gauche */}
          <div className="space-y-6">
            {/* Production */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cookie className="h-5 w-5 text-primary" />
                  Production
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cookie-weight">Poids d'un cookie (g)</Label>
                    <Input
                      id="cookie-weight"
                      type="text"
                      inputMode="decimal"
                      value={cookieWeightStr}
                      onChange={(e) => setCookieWeightStr(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cookies-wanted">Quantité (cookies)</Label>
                    <Input
                      id="cookies-wanted"
                      type="text"
                      inputMode="numeric"
                      value={cookiesWantedStr}
                      onChange={(e) => setCookiesWantedStr(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Total pâte visée : <span className="font-bold text-foreground">{fixed(desiredTotalGrams, 0)} g</span>
                    {"  "}• Calculée (après pertes 3%) : <span className="font-bold text-foreground">{fixed(totalDoughGrams, 0)} g</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Ingrédients — Quantité calculée + éditeur du prix (€/kg|€/pièce) + coût/recette */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Ingrédients
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Desktop */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="pb-3 text-left">Ingrédient</th>
                        <th className="pb-3 text-left">Quantité</th>
                        <th className="pb-3 text-right">Prix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mat.rows.map((row, i) => {
                        const unitLabel = row.unit === "pc" ? "pc" : row.unit;
                        const qtyDisplay =
                          row.unit === "pc"
                            ? `${fixed(row.neededQty, 2)} pc (≈ ${fixed(row.neededGrams, 0)} g)`
                            : `${fixed(row.neededQty, 2)} ${unitLabel}`;

                        const editorSuffix = row.unit === "pc" ? "€/pièce" : "€/kg";
                        const editorValue = row.unit === "pc" ? row.unitPrice : row.unitPrice * 1000; // afficher €/kg

                        return (
                          <tr key={i} className="border-b border-border/50 align-top last:border-0">
                            <td className="py-3">
                              <Input value={row.name} readOnly className="h-9 border-0 bg-transparent px-0 font-medium" />
                            </td>
                            <td className="py-3">
                              <div className="text-sm font-medium">{qtyDisplay}</div>
                            </td>
                            <td className="py-3">
                              {/* Éditeur : €/kg (g/ml) ou €/pièce (pc) */}
                              <div className="flex items-center justify-end gap-2">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={String(editorValue)}
                                  onChange={(e) => updateUnitPriceFromDisplay(i, e.target.value, row.unit)}
                                  className="h-9 w-32 text-right font-mono"
                                  placeholder={editorSuffix}
                                />
                                <span className="text-sm">{editorSuffix}</span>
                              </div>

                              {/* Coût pour cette recette */}
                              <div className="mt-1 text-right text-xs text-muted-foreground">
                                Coût / recette : <span className="font-medium">{euro(row.cost)}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="space-y-4 lg:hidden">
                  {mat.rows.map((row, i) => {
                    const unitLabel = row.unit === "pc" ? "pc" : row.unit;
                    const qtyDisplay =
                      row.unit === "pc"
                        ? `${fixed(row.neededQty, 2)} pc (≈ ${fixed(row.neededGrams, 0)} g)`
                        : `${fixed(row.neededQty, 2)} ${unitLabel}`;

                    const editorSuffix = row.unit === "pc" ? "€/pièce" : "€/kg";
                    const editorValue = row.unit === "pc" ? row.unitPrice : row.unitPrice * 1000;

                    return (
                      <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-4">
                        <div className="font-semibold">{row.name}</div>

                        <div className="text-sm">
                          <span className="text-muted-foreground">Quantité : </span>
                          <span className="font-medium">{qtyDisplay}</span>
                        </div>

                        <Separator />

                        {/* Éditeur prix */}
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={String(editorValue)}
                            onChange={(e) => updateUnitPriceFromDisplay(i, e.target.value, row.unit)}
                            className="h-9 w-32 text-right font-mono"
                            placeholder={editorSuffix}
                          />
                          <span className="text-sm">{editorSuffix}</span>
                        </div>

                        {/* Coût / recette */}
                        <div className="pt-1 text-right text-xs text-muted-foreground">
                          Coût / recette : <span className="font-medium">{euro(row.cost)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Paramètres */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  Paramètres
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Énergie */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Bolt className="h-4 w-4 text-primary" />
                    <span>Énergie</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="kwh-per-base">kWh (proportionnel)</Label>
                      <Input
                        id="kwh-per-base"
                        type="number"
                        step="0.1"
                        min={0}
                        value={p.kwhPerBase}
                        onChange={(e) => setP({ ...p, kwhPerBase: toPosNumber(e.target.value, p.kwhPerBase) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kwh-price">Prix kWh (€)</Label>
                      <Input
                        id="kwh-price"
                        type="number"
                        step="0.01"
                        min={0}
                        value={p.kwhPrice}
                        onChange={(e) => setP({ ...p, kwhPrice: toPosNumber(e.target.value, p.kwhPrice) })}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Eau */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Droplets className="h-4 w-4 text-primary" />
                    <span>Eau</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="liters-per-base">Litres (proportionnel)</Label>
                      <Input
                        id="liters-per-base"
                        type="number"
                        step="0.01"
                        min={0}
                        value={p.litersPerBase}
                        onChange={(e) => setP({ ...p, litersPerBase: toPosNumber(e.target.value, p.litersPerBase) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="water-price">Prix m³ (€)</Label>
                      <Input
                        id="water-price"
                        type="number"
                        step="0.1"
                        min={0}
                        value={p.waterPricePerM3}
                        onChange={(e) => setP({ ...p, waterPricePerM3: toPosNumber(e.target.value, p.waterPricePerM3) })}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Main-d'œuvre */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <HandCoins className="h-4 w-4 text-primary" />
                    <span>Main-d'œuvre</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="labor-min">Minutes (session)</Label>
                      <Input
                        id="labor-min"
                        type="number"
                        step="1"
                        min={0}
                        value={p.laborMinPerBase}
                        onChange={(e) => setP({ ...p, laborMinPerBase: toPosNumber(e.target.value, p.laborMinPerBase) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="labor-hourly">Taux horaire (€)</Label>
                      <Input
                        id="labor-hourly"
                        type="number"
                        step="0.5"
                        min={0}
                        value={p.laborHourly}
                        onChange={(e) => setP({ ...p, laborHourly: toPosNumber(e.target.value, p.laborHourly) })}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Autres paramètres */}
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Autres paramètres</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pack-cost">Emballage / cookie (€)</Label>
                      <Input
                        id="pack-cost"
                        type="number"
                        step="0.01"
                        min={0}
                        value={p.packCostPerCookie}
                        onChange={(e) => setP({ ...p, packCostPerCookie: toPosNumber(e.target.value, p.packCostPerCookie) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overhead">Frais fixes (%)</Label>
                      <Input
                        id="overhead"
                        type="number"
                        step="1"
                        min={0}
                        value={p.overheadPct}
                        onChange={(e) => setP({ ...p, overheadPct: toPosNumber(e.target.value, p.overheadPct) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="margin">Marge nette (%) (appliquée HT)</Label>
                      <Input
                        id="margin"
                        type="number"
                        step="1"
                        min={0}
                        value={p.marginPct}
                        onChange={(e) => setP({ ...p, marginPct: toPosNumber(e.target.value, p.marginPct) })}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vat">TVA (%)</Label>
                      <Input
                        id="vat"
                        type="number"
                        step="0.1"
                        min={0}
                        value={p.vatPct}
                        onChange={(e) => setP({ ...p, vatPct: toPosNumber(e.target.value, p.vatPct) })}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite - Résultats */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Résultats</CardTitle>
              </CardHeader>
              <CardContent aria-live="polite" className="space-y-4">
                <div className="space-y-3 text-base">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Coût matières</span>
                    <span className="font-bold tabular-nums">{euro(mat.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Énergie</span>
                    <span className="tabular-nums">{euro(energyTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Eau</span>
                    <span className="tabular-nums">{euro(waterTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Main-d'œuvre</span>
                    <span className="tabular-nums">{euro(laborTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Emballage</span>
                    <span className="tabular-nums">{euro(packTotal)}</span>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between text-base font-medium">
                  <span>Sous-total</span>
                  <span className="tabular-nums">{euro(variableSubtotal)}</span>
                </div>

                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">Frais fixes</span>
                  <span className="tabular-nums">{euro(overheadAmount)}</span>
                </div>

                <Separator className="bg-primary/20" />

                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Coût total</span>
                  <span className="tabular-nums text-primary">{euro(totalCost)}</span>
                </div>

                <div className="flex items-center justify-between text-base">
                  <span className="font-medium">Coût unitaire</span>
                  <span className="font-bold tabular-nums">{euro(unitCost)}</span>
                </div>
                <div className="flex items-center justify-between text-base">
  <span className="font-medium">Marge nette (HT) par cookie</span>
  <span className="font-bold tabular-nums">{euro(marginPerCookieHT)}</span>
</div>

<div className="flex items-center justify-between text-sm text-muted-foreground">
  <span>Marge totale (HT) pour {cookiesWanted} cookie{cookiesWanted > 1 ? "s" : ""}</span>
  <span className="tabular-nums">{euro(marginTotalHT)}</span>
</div>


                <Separator className="bg-primary/20" />

                <div className="space-y-3 rounded-lg bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Prix de vente par cookie</span>
                    <span className="text-xl font-bold tabular-nums text-primary">{euro(priceTTC)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Prix TTC pour {cookiesWanted} cookie{cookiesWanted > 1 ? "s" : ""}
                    </span>
                    <span className="text-2xl font-bold tabular-nums text-primary">
                      {euro(priceTTC * cookiesWanted)}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  * Perte matière de 3 % automatiquement prise en compte.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-border py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Calculateur de coût de production pour cookies artisanaux
        </div>
      </footer>
    </div>
  );
}