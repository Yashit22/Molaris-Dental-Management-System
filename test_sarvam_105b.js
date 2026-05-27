#!/usr/bin/env node

import fetch from 'node-fetch';

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const config = {
  apiKey: process.env.SARVAM_API_KEY || 'sk_irg3p455_QQQHtCF9aVD4HWEEJdkBlpvG',
  model: 'sarvam-105b',
  baseUrl: 'https://api.sarvam.ai/v1',

  // System instruction (can be overridden via env var or CLI)
  systemInstruction: process.env.SYSTEM_INSTRUCTION || `You are an expert AI medical transcriptionist specializing in clinical documentation. Your role is to:
1. Accurately transcribe medical conversations between doctors and patients
2. Extract clinical findings, diagnoses, and treatment recommendations
3. Organize information in a structured clinical note format
4. Flag any ambiguous medical terms for clarification
5. Maintain HIPAA compliance by removing/redacting patient identifiers

Output format:
- Chief Complaint
- History of Present Illness
- Physical Examination
- Assessment & Plan
- Medications/Prescriptions`,

  // Input transcription (can be overridden via env var or CLI)
  inputTranscription: process.env.INPUT_TRANSCRIPTION || `Dekhiye, aap jo concern lekar aaye hain ki ek permanent tooth, upper right permanent canine (tooth number 13), abhi tak bahar nahi aaya aur milk tooth, yaani tooth number 53, abhi bhi present hai, uska exact reason humein scan mein dikh gaya hai. Aapka upper canine tooth impacted position mein hai, matlab permanent tooth bone ke andar hi atka hua hai aur naturally erupt nahi kar pa raha. X-ray aur CBCT mein dikh raha hai ki tooth ka path thoda abnormal direction mein hai aur woh adjacent roots ke kaafi close position mein hai. Isse pehle is daant ke liye aapne koi treatment nahi liya gaya aur aapki medical history completely clear hai. Isi wajah se milk tooth abhi tak retained hai aur smile symmetry bhi affected lag rahi hai. Abhi is stage par best treatment combined surgical aur orthodontic approach rahega. Pehle minor surgical procedure se impacted canine ko expose kiya jayega. Uske baad orthodontic attachment laga kar braces ki help se us tooth ko dheere dheere proper position mein guide kiya jayega. Yeh process gradual hota hai aur kuch months se lekar over a year tak bhi lag sakta hai, depending on tooth position and movement response. Important baat yeh hai ki impacted canine ko jitna jaldi align kiya jaye, utna adjacent teeth aur bone health ke liye better rehta hai. Hum poori movement ko periodic X-rays aur orthodontic monitoring se carefully track karenge taaki roots ya surrounding structures par unnecessary stress na aaye`,

  // Parameters for API call (customizable)
  temperature: parseFloat(process.env.TEMPERATURE || '0.5'),
  top_p: parseFloat(process.env.TOP_P || '1'),
  max_tokens: parseInt(process.env.MAX_TOKENS || '2000', 10),
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
async function callSarvamAPI(systemInstruction, userContent) {
  const startTime = Date.now();
  const startTokens = Date.now(); // Placeholder for tracking

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: systemInstruction,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        model: config.model,
        temperature: config.temperature,
        top_p: config.top_p,
        max_tokens: config.max_tokens,
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
      responseTime,
      tokens: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
    };
  }
}

function estimateCost(tokens) {
  // Sarvam 105B pricing (approximate - verify with current rates)
  const inputCostPerMTok = 0.0015; // $0.0015 per 1M input tokens
  const outputCostPerMTok = 0.004;  // $0.004 per 1M output tokens

  const inputCost = (tokens.prompt / 1000000) * inputCostPerMTok;
  const outputCost = (tokens.completion / 1000000) * outputCostPerMTok;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: totalCost.toFixed(6),
  };
}

function formatOutput(result) {
  console.log('\n' + '═'.repeat(80));
  console.log('SARVAM-105B TEST RESULTS');
  console.log('═'.repeat(80));

  if (!result.success) {
    console.error('❌ API Call Failed');
    console.error(`Error: ${result.error}`);
    console.error(`Response Time: ${result.responseTime}ms`);
    return;
  }

  const { data, responseTime, tokens } = result;
  const costs = estimateCost(tokens);

  // Model Info
  console.log('\n📊 MODEL & PARAMETERS');
  console.log(`  Model: ${config.model}`);
  console.log(`  Temperature: ${config.temperature}`);
  console.log(`  Top-P: ${config.top_p}`);
  console.log(`  Max Tokens: ${config.max_tokens}`);

  // Token Usage
  console.log('\n📈 TOKEN USAGE');
  console.log(`  Input Tokens: ${tokens.prompt}`);
  console.log(`  Output Tokens: ${tokens.completion}`);
  console.log(`  Total Tokens: ${tokens.total}`);

  // Cost Analysis
  console.log('\n💰 ESTIMATED COST (USD)');
  console.log(`  Input Cost: $${costs.inputCost}`);
  console.log(`  Output Cost: $${costs.outputCost}`);
  console.log(`  Total Cost: $${costs.totalCost}`);

  // Performance
  console.log('\n⚡ PERFORMANCE');
  console.log(`  Response Time: ${responseTime}ms (${(responseTime / 1000).toFixed(2)}s)`);
  console.log(`  Tokens/Second: ${(tokens.total / (responseTime / 1000)).toFixed(2)}`);

  // Generated Output
  console.log('\n📝 GENERATED OUTPUT');
  console.log('─'.repeat(80));
  const content = data.choices?.[0]?.message?.content || 'No content generated';
  console.log(content);
  console.log('─'.repeat(80));

  // Raw Response (if needed for debugging)
  if (process.env.DEBUG === 'true') {
    console.log('\n🔍 DEBUG: Full API Response');
    console.log(JSON.stringify(data, null, 2));
  }
}

// ─── MAIN EXECUTION ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Starting Sarvam-105B TCO Test');
  console.log('─'.repeat(80));

  // Display configuration
  console.log('\n⚙️  CONFIGURATION');
  console.log(`  API Key: ${config.apiKey ? '✓ Set' : '❌ Missing'}`);
  console.log(`  Temperature: ${config.temperature}`);
  console.log(`  Top-P: ${config.top_p}`);
  console.log(`  Max Tokens: ${config.max_tokens}`);

  // Check for API key
  if (!config.apiKey || config.apiKey === 'your-api-key-here') {
    console.error('\n❌ ERROR: SARVAM_API_KEY environment variable not set!');
    console.error('Please set your Sarvam API key:');
    console.error('  export SARVAM_API_KEY="your-key-here"');
    process.exit(1);
  }

  // Display input
  console.log('\n📥 SYSTEM INSTRUCTION');
  console.log('─'.repeat(80));
  console.log(config.systemInstruction);

  console.log('\n📥 USER INPUT (TRANSCRIPTION)');
  console.log('─'.repeat(80));
  console.log(config.inputTranscription);

  // Call API
  console.log('\n⏳ Calling Sarvam-105B API...');
  const result = await callSarvamAPI(config.systemInstruction, config.inputTranscription);

  // Format and display results
  formatOutput(result);

  // TCO Analysis Tips
  console.log('\n💡 TCO ANALYSIS TIPS');
  console.log('─'.repeat(80));
  console.log(`
To optimize TCO with Sarvam-105B:

1. BATCH PROCESSING
   - Process multiple transcriptions in batches to maximize throughput
   - Use streaming responses for real-time use cases

2. PROMPT OPTIMIZATION
   - Test shorter system instructions to reduce input tokens
   - Use specific, concise prompts to reduce output tokens

3. PARAMETER TUNING
   - Lower temperature (0.0-0.3) for consistent outputs
   - Higher top_p (0.9-1.0) for more diverse outputs
   - Adjust max_tokens based on actual needs

4. VOLUME DISCOUNTS
   - Negotiate volume-based pricing for high-volume transcriptions
   - Consider reserved capacity for guaranteed throughput

5. BENCHMARKING
   - Compare costs vs. Claude, GPT-4, or other alternatives
   - Test on actual clinical transcriptions for accuracy
   - Measure end-to-end latency including preprocessing

Test Commands:
  # Test with custom system instruction
  SYSTEM_INSTRUCTION="Your custom instruction" node test_sarvam_105b.js

  # Test with custom input
  INPUT_TRANSCRIPTION="Your transcription" node test_sarvam_105b.js

  # Test with different parameters
  TEMPERATURE=0.3 TOP_P=0.9 MAX_TOKENS=1000 node test_sarvam_105b.js

  # Enable debug mode
  DEBUG=true node test_sarvam_105b.js
  `);
}

// Run
main().catch(console.error);
