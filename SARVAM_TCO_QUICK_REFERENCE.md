# Sarvam-105B TCO Testing - Quick Reference

## One-Liners for Common Tests

### 1️⃣ Basic Test
```bash
export SARVAM_API_KEY="your-key" && node test_sarvam_105b.js
```

### 2️⃣ Fast & Cheap (Real-time)
```bash
TEMPERATURE=0.2 MAX_TOKENS=500 node test_sarvam_105b.js
```

### 3️⃣ High Quality (Batch)
```bash
TEMPERATURE=0.7 MAX_TOKENS=3000 node test_sarvam_105b.js
```

### 4️⃣ Test with Hindi Transcription
```bash
INPUT_TRANSCRIPTION="डॉक्टर: आप कैसा महसूस कर रहे हैं?" node test_sarvam_105b.js
```

### 5️⃣ Test with Tamil Transcription
```bash
INPUT_TRANSCRIPTION="டாக்டர்: நீங்கள் எப்படி இருக்கிறீர்கள்?" node test_sarvam_105b.js
```

### 6️⃣ Debug Mode
```bash
DEBUG=true node test_sarvam_105b.js
```

### 7️⃣ Cost Only (Min Tokens)
```bash
MAX_TOKENS=100 node test_sarvam_105b.js
```

---

## Understanding the Output

```
📊 MODEL & PARAMETERS
  Temperature: 0.5 → Higher = More creative, Lower = More consistent

📈 TOKEN USAGE
  Input: 250 tokens → From your system instruction + input
  Output: 1,200 tokens → Generated response

💰 ESTIMATED COST
  Total Cost: $0.004875 → This is what you pay per call

⚡ PERFORMANCE
  Response Time: 2450ms → How fast the API responds
  Tokens/Second: 596 → Throughput indicator
```

---

## Cost Calculation Cheat Sheet

### Monthly Volume Estimates
```
Volume / Day    × Avg Cost/Call    = Daily Cost   = Monthly Cost
20              × $0.005           = $0.10        = $3
50              × $0.005           = $0.25        = $7.50
100             × $0.005           = $0.50        = $15
200             × $0.005           = $1.00        = $30
500             × $0.005           = $2.50        = $75
1000            × $0.005           = $5.00        = $150
2000            × $0.005           = $10.00       = $300
5000            × $0.005           = $25.00       = $750
```

### Token Counts (Typical)
- Short note (100 words): ~150 input, ~300 output = $0.0015
- Medium note (300 words): ~250 input, ~800 output = $0.0040
- Long note (500+ words): ~400 input, ~1500 output = $0.0070

---

## Comparison Matrix

### vs Claude (Claude 3 Haiku)
```
                Sarvam-105B     Claude Haiku    Winner
Cost/1K tokens  $0.0015-0.004   $0.0008-0.002   Depends on tokens
Indian Languages  90% win rate    Weaker         Sarvam ✓
Math/Reasoning    98.6/Math500    95.6/Math500   Sarvam ✓
Speed             Fast            Very Fast      Claude ✓
```

### vs GPT-4
```
                Sarvam-105B     GPT-4           Winner
Cost            Cheaper         $0.03/1K input  Sarvam ✓
Indian Lang     Excellent       Good            Sarvam ✓
Reasoning       98.6/Math500    98.0/Math500    Sarvam ✓
Availability    Good            Limited access  Depends
```

---

## Parameter Tuning Guide

### Temperature (0 = Consistent, 2 = Creative)
```
0.0-0.3     → Medical transcription (consistency is key)
0.4-0.6     → Balanced (default, good for most tasks)
0.7-1.0     → Creative reasoning needed
1.1-1.5     → Brainstorming/alternative outputs
1.6-2.0     → High variance (rarely needed)
```

### Top-P (0 = Greedy, 1 = All tokens)
```
0.5-0.7     → Focused, deterministic
0.8-0.9     → Balanced diversity
0.95-1.0    → Full probability distribution
```

### Max Tokens (affects cost & time)
```
500         → Quick summary, low cost
1000        → Standard clinical note
2000        → Detailed comprehensive note
3000        → Very detailed with reasoning
5000+       → Rarely needed, high cost
```

---

## Decision Framework

### Should You Use Sarvam-105B?

**YES if:**
- ✅ High volume of transcriptions (100+/day)
- ✅ Need Indian language support
- ✅ Cost is important factor
- ✅ Accept <2-5 second latency
- ✅ Medical/clinical use case

**MAYBE if:**
- ⚠️ Need very high accuracy (test first)
- ⚠️ Integration complexity concerns
- ⚠️ Compliance/HIPAA requirements

**NO if:**
- ❌ Need real-time <500ms response
- ❌ Very small volume (1-5 transcriptions/day)
- ❌ Specialized medical domain
- ❌ Can't accept any hallucinations

---

## Quick TCO Formula

```
Monthly Cost = Daily Volume × Days/Month × Cost Per Call

Cost Per Call ≈ (Input Tokens × $0.0000015) + (Output Tokens × $0.000004)

Example:
- 100 transcriptions/day
- Avg 250 input + 800 output tokens = ~$0.005/call
- 100 × 30 × $0.005 = $15/month

At scale (1000/day):
- 1000 × 30 × $0.005 = $150/month
- Bulk discounts could bring this to $75-100/month
```

---

## Environment Variables Reference

```bash
# Required
SARVAM_API_KEY="your-api-key"

# Optional (with defaults)
SYSTEM_INSTRUCTION="Custom system prompt"    # Default: Medical transcription
INPUT_TRANSCRIPTION="Your transcription"     # Default: Sample medical dialogue
TEMPERATURE=0.5                              # Default: 0.5
TOP_P=1                                      # Default: 1
MAX_TOKENS=2000                              # Default: 2000
DEBUG=true                                   # Enable full response logging
```

---

## Testing Checklist

- [ ] Get API key from Sarvam dashboard
- [ ] Export SARVAM_API_KEY
- [ ] Run basic test: `node test_sarvam_105b.js`
- [ ] Note average cost per transcription
- [ ] Test with your actual transcriptions
- [ ] Adjust temperature for your quality needs
- [ ] Test with Indian languages (if applicable)
- [ ] Load test with multiple concurrent calls
- [ ] Calculate monthly/yearly TCO for your volume
- [ ] Compare with current solution
- [ ] Get clinical review of output quality
- [ ] Plan integration with your system

---

## Red Flags

🚩 **Stop and reconsider if:**
- Consistent medical errors in output
- Hallucinated patient information
- Response times > 10 seconds
- API rate limiting issues at your volume
- Cost significantly higher than expected
- Quality noticeably worse than alternatives

---

## Next Batch Sizes for Testing

| Phase | Transcriptions | Goal | Variables |
|-------|---|---|---|
| Phase 1 | 5 | Baseline cost/quality | Temperature |
| Phase 2 | 20 | Variance testing | Max Tokens |
| Phase 3 | 50 | Real transcriptions | System Instruction |
| Phase 4 | 100+ | Load testing | Concurrent calls |

---

## Resources

- 📖 [Sarvam Docs](https://docs.sarvam.ai/)
- 🧮 [Token Counter](https://platform.openai.com/tokenizer)
- 💵 [Pricing Calculator](https://www.sarvam.ai/pricing)
- 🔑 [API Dashboard](https://console.sarvam.ai/)

---

**Last Updated**: 2026-05-26  
**Script Version**: 1.0  
**Sarvam Model**: sarvam-105b (105B+ MoE)
