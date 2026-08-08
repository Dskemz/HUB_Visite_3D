#!/usr/bin/env node

/**
 * VLM Benchmark — passe chaque plan PNG au Claude VLM, recueille les JSON extraits,
 * score la précision géométrie/matériaux, et compile un rapport.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-5';  // ← MODÈLE CORRIGÉ
const MAX_TOKENS = 1000;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set');
  console.error('   Run: $env:ANTHROPIC_API_KEY="sk-..."');
  process.exit(1);
}

// Prompt VLM optimisé
const VLM_PROMPT = `Tu es un expert en analyse de plans d'architecture 2D. Analyse ce plan et extrais les informations en JSON structuré.

INSTRUCTIONS:
1. Identifie chaque pièce (salon, chambre, cuisine, salle d'eau, etc.)
2. Estime les dimensions approximatives en mètres (si échelle visible)
3. Détecte les murs, portes, fenêtres, ouvertures
4. Estime les matériaux (parquet, carrelage, peinture — si visibles)
5. Structure d'agencement (plan ouvert vs cloisonné)

RÉPONSE EN JSON SEUL (pas de texte):
{
  "rooms": [
    {"name": "Salon", "estimated_m2": 25, "type": "living", "doors": 1, "windows": 1},
    {"name": "Chambre 1", "estimated_m2": 15, "type": "bedroom", "doors": 1, "windows": 1}
  ],
  "layout_type": "open_plan|semi_open|separated",
  "detected_materials": ["parquet", "carrelage", ...],
  "total_estimated_m2": 45,
  "confidence_score": 0.75,
  "hallucination_risk": "low|medium|high",
  "notes": "..."
}`;

/**
 * Appelle Claude API avec l'image en base64
 */
async function callClaudeVLM(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const mediaType = 'image/png';

  const requestBody = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64
            }
          },
          {
            type: 'text',
            text: VLM_PROMPT
          }
        ]
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              const msg = parsed.error.message || JSON.stringify(parsed.error);
              reject(new Error(`API Error (${res.statusCode}): ${msg}`));
            }
            else if (res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
            }
            else resolve(parsed);
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}\nResponse: ${data.substring(0, 300)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * Extrait le JSON de la réponse Claude
 */
function extractJSON(responseText) {
  const match = responseText.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

/**
 * Évalue la qualité de l'extraction (0-100)
 */
function scoreExtraction(extracted, expectedRoomCount, planId) {
  if (!extracted || !extracted.rooms) return 0;

  let score = 50; // base
  
  // Points pour nombre de pièces correct
  if (extracted.rooms.length === expectedRoomCount) score += 20;
  else if (Math.abs(extracted.rooms.length - expectedRoomCount) === 1) score += 10;

  // Points pour confiance et hallucination
  if (extracted.confidence_score >= 0.7) score += 15;
  if (extracted.hallucination_risk === 'low') score += 10;
  else if (extracted.hallucination_risk === 'medium') score += 5;

  // Points pour détection matériaux
  if (extracted.detected_materials && extracted.detected_materials.length > 0) score += 5;

  return Math.min(100, score);
}

/**
 * Main benchmark
 */
async function runBenchmark() {
  const inventory = JSON.parse(fs.readFileSync('inventory.json', 'utf-8'));
  const results = [];

  console.log('🔬 VLM Floor Plan Benchmark\n');
  console.log(`Testing ${inventory.plans.length} plans...\n`);

  // Expected room counts pour scoring
  const expectations = {
    'studio-28': 2,      
    't2-45': 2,          
    't3-75': 3,          
    't4-100': 4,         
    'maison-120': 5      
  };

  for (const plan of inventory.plans) {
    const planPath = path.join(__dirname, `${plan.id}.png`);
    if (!fs.existsSync(planPath)) {
      console.log(`⚠️  ${plan.id}: PNG not found`);
      continue;
    }

    console.log(`📋 ${plan.id} (${plan.title})...`);
    
    try {
      const response = await callClaudeVLM(planPath);
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent) throw new Error('No text in response');

      const extracted = extractJSON(textContent.text);
      if (!extracted) throw new Error('Could not extract JSON');

      const score = scoreExtraction(extracted, expectations[plan.id], plan.id);

      results.push({
        plan_id: plan.id,
        title: plan.title,
        extracted: extracted,
        score: score,
        status: 'success'
      });

      console.log(`   ✓ Extracted ${extracted.rooms.length} rooms, score: ${score}/100\n`);
    } catch (err) {
      console.log(`   ❌ ${err.message}\n`);
      results.push({
        plan_id: plan.id,
        title: plan.title,
        error: err.message,
        status: 'failed'
      });
    }

    // Délai entre appels
    await new Promise(r => setTimeout(r, 1000));
  }

  // Rapport final
  console.log('\n' + '='.repeat(60));
  console.log('📊 BENCHMARK RESULTS\n');

  const successful = results.filter(r => r.status === 'success');
  const avgScore = successful.length > 0 
    ? (successful.reduce((sum, r) => sum + r.score, 0) / successful.length).toFixed(1)
    : 'N/A';

  console.log(`Total plans tested: ${results.length}`);
  console.log(`Successful extractions: ${successful.length}/${results.length}`);
  console.log(`Average accuracy score: ${avgScore}/100\n`);

  console.log('Detailed results:');
  for (const r of results) {
    if (r.status === 'success') {
      console.log(`  ${r.plan_id.padEnd(15)} : ${r.score}/100 (${r.extracted.rooms.length} rooms detected)`);
    } else {
      console.log(`  ${r.plan_id.padEnd(15)} : FAILED (${r.error})`);
    }
  }

  // Sauvegarder rapport JSON
  fs.writeFileSync('benchmark_results.json', JSON.stringify(results, null, 2));
  console.log('\n✓ Full results saved to benchmark_results.json');

  return avgScore >= 75 ? 0 : 1;
}

runBenchmark().then(code => process.exit(code)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
