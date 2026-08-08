# VLM Floor Plan Benchmark

Ensemble de 5 plans 2D pour benchmarker le VLM (Vision Language Model) sur l'extraction géométrie d'intérieurs.

## Plans générés

- **studio-28.png** : Studio 28m² (séjour + cuisine ouverte + salle d'eau)
- **t2-45.png** : T2 45m² (chambre + séjour/cuisine + salle d'eau)
- **t3-75.png** : T3 75m² (2 chambres + séjour + cuisine séparée + salle d'eau)
- **t4-100.png** : T4 100m² (3 chambres + séjour + cuisine + salle d'eau + dégagement)
- **maison-120.png** : Maison plain-pied 120m² (3 chambres + séjour + cuisine + salle d'eau)

## Utilisation

### Option 1 : Benchmark automatisé (Node.js + API Claude)

```bash
export ANTHROPIC_API_KEY="sk-..."
node benchmark_vlm.js
```

Génère `benchmark_results.json` avec :
- Pièces détectées par le VLM
- Score d'extraction (0-100)
- Risque d'hallucination
- Matériaux détectés

### Option 2 : Test manuel (vlm-plan-bench.html)

1. Ouvre vlm-plan-bench.html dans ton navigateur
2. Glisse-dépose chaque plan PNG
3. Note la géométrie/matériaux détectés

## Métriques évaluées

- ✓ Nombre de pièces détectées (vs attendu)
- ✓ Confiance du modèle (0-1)
- ✓ Risque hallucination (low/medium/high)
- ✓ Matériaux reconnus
- ✓ Type agencement (plan ouvert vs cloisonné)

## Résultats cibles

Pour Phase 2 (auto GLB), on vise :
- **75%+ accuracy** sur détection géométrie
- **<20% hallucination rate** (pièces inventées)
- **<300ms latence** par plan (Claude API)

Après ça : on analyse **ta méthodologie Blender** pour adapter le pipeline genération.
