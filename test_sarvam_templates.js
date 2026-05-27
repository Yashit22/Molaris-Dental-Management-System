#!/usr/bin/env node

import fetch from 'node-fetch';

// ─── QUICK CONFIGURATION (EDIT HERE) ────────────────────────────────────────────
// Set these variables or use environment variables to override
const QUICK_CONFIG = {
  // Which template to test: patient_letter, dentistry_note, comprehensive_exam, soap_note, soap_note_issues, hp_note, hp_note_issues
  template: 'patient_letter',

  // Which transcription: headache, impacted_canine, root_canal (or use INPUT_TRANSCRIPTION for custom)
  transcription: 'impacted_canine',

  // API and Model settings
  apiKey: 'sk_irg3p455_QQQHtCF9aVD4HWEEJdkBlpvG',
  model: 'sarvam-105b',
  baseUrl: 'https://api.sarvam.ai/v1',

  // Model parameters (customize for your needs)
  temperature: 0.5,    // 0.0-2.0: higher = more creative, lower = more consistent
  top_p: 1.0,         // 0.0-1.0: diversity of outputs
  max_tokens: 3000,   // max ~3000; higher values may cause 400 errors

  // Optional overrides
  customSystemInstruction: null,  // null = use template's default, or provide custom instruction
  customTranscription: null,      // null = use pre-built transcription, or provide custom text
};

// ─── TEMPLATES CONFIGURATION ────────────────────────────────────────────────────
const TEMPLATES = {
  patient_letter: {
    id: 'patient_letter_v1',
    name: 'Patient Letter',
    category: 'Patient Comms',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

Never come up with your own patient details, assessment, plan, interventions, evaluation, and plan for continuing care - use only the transcript, contextual notes or clinical note as a reference for the information included in your note. If any information related to a placeholder has not been explicitly mentioned in the transcript, contextual notes or clinical note, you must not state the information has not been explicitly mentioned in your output, just leave the relevant placeholder or omit the placeholder completely. This letter is to be sent to the patient; use patient-friendly, clear and empathetic language, avoid medical jargon or explain it briefly in simple terms, and keep instructions concise and actionable.`,
  },
  dentistry_note: {
    id: 'dentistry_note_v1',
    name: 'Dentistry Note',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting a comprehensive patient history and treatment plan from a consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Use professional clinical language appropriate for clinical record-keeping. Include tooth numbers using FDI notation when referring to specific teeth. Organize findings systematically by anatomical region and complaint. Be concise but thorough. Never come up with your own patient details, assessment, plans, interventions, or prognosis - use only what was explicitly discussed. If information is not provided, omit the section entirely rather than stating it was not mentioned.`,
  },
  comprehensive_exam: {
    id: 'comprehensive_dental_exam_v1',
    name: 'Comprehensive Dental Exam',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting a comprehensive dental examination following a patient consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Use professional clinical language appropriate for formal clinical record-keeping. Include tooth numbers using FDI notation. Be comprehensive but organized. When information is not provided in the transcript, write "N/A" for that section. Never come up with your own patient details, diagnoses, assessment, plans, or prognosis. If a finding is normal or no abnormalities detected, write "NAD" instead of omitting the section. Use as many lines, paragraphs, or bullet points as needed to capture all relevant information from the transcript.`,
  },
  soap_note: {
    id: 'soap_note_v1',
    name: 'SOAP Note',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting a SOAP note (Subjective, Objective, Assessment, Plan) from a consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Organize findings systematically using the SOAP format. Use professional clinical language. Include tooth numbers using FDI notation. Never come up with your own patient details, diagnoses, assessment, plans, or prognosis. If information is not provided in the transcript, leave that placeholder or section blank entirely rather than stating it was not mentioned. Use as many lines, paragraphs, or bullet points as needed to capture all relevant information from the transcript.`,
  },
  soap_note_issues: {
    id: 'soap_note_issues_v1',
    name: 'SOAP Note (Issues Centric)',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting an issues-centric SOAP note from a consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Organize findings by individual issues or problems using the SOAP format for each issue. Use professional clinical language. Include tooth numbers using FDI notation. Never come up with your own patient details, diagnoses, assessment, plans, or prognosis. If information is not provided in the transcript, leave that placeholder or section blank entirely rather than stating it was not mentioned. Use as many lines, paragraphs, or bullet points as needed to capture all relevant information from the transcript.`,
  },
  hp_note: {
    id: 'hp_note_v1',
    name: 'H&P Note',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting a comprehensive H&P (History & Physical) note from a consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Organize findings systematically using standard H&P format with clear separation between history, examination, investigations, assessment, and plan sections. Use professional clinical language. Include tooth numbers using FDI notation. Never come up with your own patient details, diagnoses, assessment, plans, or prognosis. If information is not provided in the transcript, omit that placeholder or section entirely rather than stating it was not mentioned. Use as many lines, paragraphs, or bullet points as needed to capture all relevant information from the transcript.`,
  },
  hp_note_issues: {
    id: 'hp_note_issues_v1',
    name: 'H&P Note (Issues Centric)',
    category: 'Clinical',
    systemInstruction: `IMPORTANT: You MUST write your entire response EXCLUSIVELY in English. Do not write in Hindi, Hinglish, or any other language. Every single word must be in English.

You are a dental clinician documenting an issues-centric H&P (History & Physical) note from a consultation. Extract only information explicitly mentioned in the transcript, contextual notes, or clinical note. Organize findings using standard H&P format with a clear separation between history, examination, investigations, and impression/plan sections. For the assessment and plan, organize findings by individual issues or problems. Use professional clinical language. Include tooth numbers using FDI notation. Never come up with your own patient details, diagnoses, assessment, plans, or prognosis. If information is not provided in the transcript, omit that placeholder or section entirely rather than stating it was not mentioned. Use as many lines, paragraphs, or bullet points as needed to capture all relevant information from the transcript.`,
  },
};

// ─── EXAMPLE TRANSCRIPTIONS ─────────────────────────────────────────────────────
const TRANSCRIPTIONS = {
  headache: `Doctor: Good morning, what brings you in today?
Patient: Hi doctor, I've been having this persistent headache for about 3 days now. It's mostly on the right side.
Doctor: I see. On a scale of 1 to 10, how severe would you say the pain is?
Patient: About 6 out of 10. It gets worse when I look at bright lights.
Doctor: Any nausea or vomiting?
Patient: A little bit of nausea, but no vomiting.
Doctor: Have you taken anything for the pain?
Patient: I tried some paracetamol yesterday, but it didn't help much.
Doctor: Okay. Let me examine you. Your blood pressure is normal, 120/80. Eyes are reactive. I suspect you might have a migraine. I'm going to prescribe you a migraine-specific medication. Also, try to rest in a dark room and stay hydrated.`,

  impacted_canine: `Dekhiye, aap jo concern lekar aaye hain ki ek permanent tooth, upper right permanent canine (tooth number 13), abhi tak bahar nahi aaya aur milk tooth, yaani tooth number 53, abhi bhi present hai, uska exact reason humein scan mein dikh gaya hai. Aapka upper canine tooth impacted position mein hai, matlab permanent tooth bone ke andar hi atka hua hai aur naturally erupt nahi kar pa raha. X-ray aur CBCT mein dikh raha hai ki tooth ka path thoda abnormal direction mein hai aur woh adjacent roots ke kaafi close position mein hai. Isse pehle is daant ke liye aapne koi treatment nahi liya gaya aur aapki medical history completely clear hai. Isi wajah se milk tooth abhi tak retained hai aur smile symmetry bhi affected lag rahi hai. Abhi is stage par best treatment combined surgical aur orthodontic approach rahega. Pehle minor surgical procedure se impacted canine ko expose kiya jayega. Uske baad orthodontic attachment laga kar braces ki help se us tooth ko dheere dheere proper position mein guide kiya jayega. Yeh process gradual hota hai aur kuch months se lekar over a year tak bhi lag sakta hai, depending on tooth position and movement response. Important baat yeh hai ki impacted canine ko jitna jaldi align kiya jaye, utna adjacent teeth aur bone health ke liye better rehta hai. Hum poori movement ko periodic X-rays aur orthodontic monitoring se carefully track karenge taaki roots ya surrounding structures par unnecessary stress na aaye.`,

  root_canal: `Doctor: You've been experiencing severe pain in your lower left molar?
Patient: Yes, it started 3 days ago. It's a throbbing pain, especially at night.
Doctor: On a scale of 1 to 10?
Patient: 8 out of 10 when I bite down. Cold water makes it worse.
Doctor: I can see deep decay under the old filling. X-ray shows the infection has reached the nerve. We need to do a root canal treatment.
Patient: Is there any alternative?
Doctor: Extraction is an option, but I strongly recommend saving the tooth. We'll do emergency treatment today - access and pulp removal. Then complete the root canal treatment in the next visit.
Doctor: You'll need antibiotics - Amoxicillin 500mg three times daily for 5 days. Take Paracetamol 650mg for pain. Avoid hard foods on that side.`,
};

// ─── RESOLVE CONFIGURATION (Environment variables override QUICK_CONFIG above) ─
const config = {
  apiKey: process.env.SARVAM_API_KEY || QUICK_CONFIG.apiKey,
  model: process.env.MODEL || QUICK_CONFIG.model,
  baseUrl: process.env.BASE_URL || QUICK_CONFIG.baseUrl,
  template: process.env.TEMPLATE || QUICK_CONFIG.template,
  transcription: process.env.TRANSCRIPTION || QUICK_CONFIG.transcription,
  systemInstruction: process.env.SYSTEM_INSTRUCTION || QUICK_CONFIG.customSystemInstruction,
  inputTranscription: process.env.INPUT_TRANSCRIPTION || QUICK_CONFIG.customTranscription,
  temperature: parseFloat(process.env.TEMPERATURE || QUICK_CONFIG.temperature),
  top_p: parseFloat(process.env.TOP_P || QUICK_CONFIG.top_p),
  max_tokens: parseInt(process.env.MAX_TOKENS || QUICK_CONFIG.max_tokens, 10),
};

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
async function callSarvamAPI(systemInstruction, userContent) {
  const startTime = Date.now();

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
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || response.statusText;
      throw new Error(`API Error ${response.status}: ${errorMsg}`);
    }

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
  const inputCostPerMTok = 0.0015;
  const outputCostPerMTok = 0.004;

  const inputCost = (tokens.prompt / 1000000) * inputCostPerMTok;
  const outputCost = (tokens.completion / 1000000) * outputCostPerMTok;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: totalCost.toFixed(6),
  };
}

function formatOutput(result, templateInfo, transcriptionKey) {
  console.log('\n' + '═'.repeat(100));
  console.log('SARVAM-105B TEMPLATE TEST RESULTS');
  console.log('═'.repeat(100));

  if (!result.success) {
    console.error('❌ API Call Failed');
    console.error(`Error: ${result.error}`);
    console.error(`Response Time: ${result.responseTime}ms`);
    return;
  }

  const { data, responseTime, tokens } = result;
  const costs = estimateCost(tokens);

  // Template Info
  console.log('\n📋 TEMPLATE INFORMATION');
  console.log(`  Template ID: ${templateInfo.id}`);
  console.log(`  Template Name: ${templateInfo.name}`);
  console.log(`  Category: ${templateInfo.category}`);
  console.log(`  Transcription Type: ${transcriptionKey}`);

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
  console.log(`  Monthly (100 transcriptions): $${(costs.totalCost * 100).toFixed(4)}`);
  console.log(`  Monthly (1000 transcriptions): $${(costs.totalCost * 1000).toFixed(2)}`);

  // Performance
  console.log('\n⚡ PERFORMANCE');
  console.log(`  Response Time: ${responseTime}ms (${(responseTime / 1000).toFixed(2)}s)`);
  console.log(`  Tokens/Second: ${(tokens.total / (responseTime / 1000)).toFixed(2)}`);

  // System Instruction
  console.log('\n📝 SYSTEM INSTRUCTION');
  console.log('─'.repeat(100));
  console.log(templateInfo.systemInstruction);

  // Generated Output
  console.log('\n📄 GENERATED OUTPUT');
  console.log('─'.repeat(100));
  const content = data.choices?.[0]?.message?.content || 'No content generated';
  console.log(content);
  console.log('─'.repeat(100));

  // Raw Response (if needed for debugging)
  if (process.env.DEBUG === 'true') {
    console.log('\n🔍 DEBUG: Full API Response');
    console.log(JSON.stringify(data, null, 2));
  }
}

// ─── MAIN EXECUTION ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Starting Sarvam-105B Template Test');
  console.log('─'.repeat(100));

  // Display available options
  console.log('\n📋 AVAILABLE TEMPLATES:');
  Object.entries(TEMPLATES).forEach(([key, template]) => {
    const marker = key === config.template ? ' ✓ SELECTED' : '';
    console.log(`  - ${key.padEnd(20)} : ${template.name}${marker}`);
  });

  console.log('\n📋 AVAILABLE TRANSCRIPTIONS:');
  Object.keys(TRANSCRIPTIONS).forEach((key) => {
    const marker = key === config.transcription ? ' ✓ SELECTED' : '';
    console.log(`  - ${key.padEnd(20)}${marker}`);
  });

  // Check for API key
  if (!config.apiKey || config.apiKey === 'your-api-key-here') {
    console.error('\n❌ ERROR: SARVAM_API_KEY environment variable not set!');
    process.exit(1);
  }

  // Validate template
  if (!TEMPLATES[config.template]) {
    console.error(`\n❌ ERROR: Unknown template "${config.template}"`);
    console.error(`Available templates: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  // Validate transcription
  if (!TRANSCRIPTIONS[config.transcription]) {
    console.error(`\n❌ ERROR: Unknown transcription "${config.transcription}"`);
    console.error(`Available transcriptions: ${Object.keys(TRANSCRIPTIONS).join(', ')}`);
    process.exit(1);
  }

  const templateInfo = TEMPLATES[config.template];
  const transcriptionText = config.inputTranscription || TRANSCRIPTIONS[config.transcription];
  const systemInstruction = config.systemInstruction || templateInfo.systemInstruction;

  // Display configuration
  console.log('\n⚙️  CONFIGURATION');
  console.log(`  API Key: ${config.apiKey ? '✓ Set' : '❌ Missing'}`);
  console.log(`  Template: ${config.template}`);
  console.log(`  Transcription: ${config.transcription}`);
  console.log(`  Temperature: ${config.temperature}`);
  console.log(`  Top-P: ${config.top_p}`);
  console.log(`  Max Tokens: ${config.max_tokens}`);

  // Display input
  console.log('\n📥 USER INPUT (TRANSCRIPTION)');
  console.log('─'.repeat(100));
  console.log(transcriptionText);

  // Call API
  console.log('\n⏳ Calling Sarvam-105B API...');
  const result = await callSarvamAPI(systemInstruction, transcriptionText);

  // Format and display results
  formatOutput(result, templateInfo, config.transcription);

  // Test Commands
  console.log('\n💡 TEST DIFFERENT TEMPLATES & TRANSCRIPTIONS');
  console.log('─'.repeat(100));
  console.log(`
# Test Patient Letter with Hindi transcription
TEMPLATE=patient_letter TRANSCRIPTION=impacted_canine node test_sarvam_templates.js

# Test Dentistry Note with Root Canal transcription
TEMPLATE=dentistry_note TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Test Comprehensive Exam with custom transcription
TEMPLATE=comprehensive_exam INPUT_TRANSCRIPTION="Your transcription here" node test_sarvam_templates.js

# Test SOAP Note with different parameters
TEMPLATE=soap_note TEMPERATURE=0.3 MAX_TOKENS=1500 node test_sarvam_templates.js

# Test H&P Note (Issues Centric)
TEMPLATE=hp_note_issues TRANSCRIPTION=headache node test_sarvam_templates.js

# Available Templates: ${Object.keys(TEMPLATES).join(', ')}
# Available Transcriptions: ${Object.keys(TRANSCRIPTIONS).join(', ')}
  `);
}

// Run
main().catch(console.error);
