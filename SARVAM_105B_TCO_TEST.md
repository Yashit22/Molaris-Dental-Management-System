# Sarvam-105B TCO Testing Script

This script allows you to test Sarvam-105B for your medical transcription use case and analyze Total Cost of Ownership (TCO).

## Setup

### 1. Get API Key
- Sign up at [Sarvam AI](https://www.sarvam.ai/)
- Get your API key from the dashboard
- Set it as an environment variable

### 2. Install Dependencies
```bash
npm install node-fetch
```

## Usage

### Basic Test (Default Configuration)
```bash
export SARVAM_API_KEY="your-api-key-here"
node test_sarvam_105b.js
```

### Customize System Instruction
```bash
export SARVAM_API_KEY="your-api-key"
export SYSTEM_INSTRUCTION="Your custom system prompt here"
node test_sarvam_105b.js
```

### Customize Input Transcription
```bash
export SARVAM_API_KEY="your-api-key"
export INPUT_TRANSCRIPTION="Your medical transcription here"
node test_sarvam_105b.js
```

### Test Different Parameters

#### Lower Temperature (More Consistent)
```bash
TEMPERATURE=0.1 node test_sarvam_105b.js
```

#### Higher Temperature (More Creative)
```bash
TEMPERATURE=1.5 node test_sarvam_105b.js
```

#### Adjust Max Tokens
```bash
MAX_TOKENS=500 node test_sarvam_105b.js
```

#### Adjust Top-P
```bash
TOP_P=0.7 node test_sarvam_105b.js
```

### Enable Debug Mode (See Full API Response)
```bash
DEBUG=true node test_sarvam_105b.js
```

## TCO Calculation

The script calculates estimated costs based on Sarvam's pricing:
- **Input**: $0.0015 per 1M tokens
- **Output**: $0.004 per 1M tokens

Example:
```
Input Tokens: 250
Output Tokens: 1,200
Total Cost: $0.000375 + $0.0048 = $0.004875
```

## Benchmarking Against Alternatives

### Test Multiple Models
```bash
# Run with different system prompts to simulate real workloads
INPUT_TRANSCRIPTION="Doctor: Patient comes in with chest pain..." node test_sarvam_105b.js
```

### Compare with Claude
```bash
# Run Sarvam test
node test_sarvam_105b.js

# Then compare with your Claude API calls
# Check your organization's token usage and pricing
```

## Example Configurations

### 1. Medical Transcription (Default)
- **Purpose**: Clinical note generation from doctor-patient conversations
- **Temperature**: 0.5 (balanced accuracy and consistency)
- **Max Tokens**: 2000 (comprehensive clinical notes)
- **Use Case**: Direct transcription to EHR

### 2. Real-time Clinical Assistant
```bash
TEMPERATURE=0.3 MAX_TOKENS=500 node test_sarvam_105b.js
```
- Lower temp for consistency
- Fewer tokens for faster responses
- Good for real-time clinical support

### 3. Quality-focused Batch Processing
```bash
TEMPERATURE=0.7 MAX_TOKENS=3000 node test_sarvam_105b.js
```
- Higher temp for better reasoning
- More tokens for detailed analysis
- Good for quality control and review

### 4. Cost-optimized
```bash
TEMPERATURE=0.2 MAX_TOKENS=1000 node test_sarvam_105b.js
```
- Minimal configuration
- Fastest response
- Lowest cost per transcription

## What the Script Shows

### 📊 Model & Parameters
- Which model, temperature, top-p, and token limits you're using

### 📈 Token Usage
- Input tokens: How many tokens your prompt used
- Output tokens: How many tokens the response generated
- Total tokens: Sum of both
- **Key for TCO**: Higher token usage = Higher cost

### 💰 Estimated Cost
- Exact cost per API call
- Break down of input vs output costs
- **Monthly projection**: Cost × daily transcriptions × 30

### ⚡ Performance
- Response time in milliseconds
- Tokens per second (throughput metric)
- **Key for UX**: Lower latency = Better user experience

### 📝 Generated Output
- The actual clinical notes generated
- Evaluate quality and completeness

## TCO Analysis Questions to Answer

1. **Cost Efficiency**
   - At your volume, how much does Sarvam cost per transcription?
   - Compare to current solution (manual, other AI, in-house)

2. **Quality**
   - Does the output match your clinical documentation standards?
   - Any hallucinations or medical errors?
   - Better than Claude/GPT-4 for your use case?

3. **Speed**
   - Is the response time acceptable for your workflow?
   - Can you batch process or need real-time?

4. **Scalability**
   - Can you handle 100 transcriptions/day?
   - 1000 transcriptions/day?
   - What's the API rate limit?

5. **Indian Language Support**
   - Sarvam-105B is strong on Indian languages
   - If you have multilingual transcriptions, test with Hindi, Tamil, etc.

## Example Real-World Scenarios

### Scenario 1: Small Clinic (20 transcriptions/day)
```
Cost per transcription: $0.005
Daily cost: 20 × $0.005 = $0.10
Monthly cost: $3
Annual cost: $36
```

### Scenario 2: Mid-size Hospital (200 transcriptions/day)
```
Cost per transcription: $0.005
Daily cost: 200 × $0.005 = $1.00
Monthly cost: $30
Annual cost: $360
```

### Scenario 3: Large Hospital (2000 transcriptions/day)
```
Cost per transcription: $0.005
Daily cost: 2000 × $0.005 = $10.00
Monthly cost: $300
Annual cost: $3,600
```

## Comparing with Your Current Solution

| Aspect | Sarvam-105B | Your Current | Savings |
|--------|-------------|-------------|---------|
| Cost per transcription | $0.005 | ? | ? |
| Response time | ~2-5s | ? | ? |
| Accuracy | 95%+ | ? | ? |
| Indian language support | 90% win rate | ? | ? |

## Next Steps

1. **Test with Real Data**
   - Use actual transcriptions from your clinic
   - Run multiple tests to get average costs/performance

2. **Load Testing**
   - Test with concurrent requests
   - Check API rate limits and throttling

3. **Quality Assurance**
   - Have a clinician review generated notes
   - Check for medical errors or omissions

4. **Integration Testing**
   - Test with your EHR system
   - Validate data formats and compliance

5. **Cost Modeling**
   - Calculate exact TCO for your volume
   - Factor in infrastructure, staffing, training

## Troubleshooting

### "API Key Missing"
```bash
export SARVAM_API_KEY="your-key-here"
echo $SARVAM_API_KEY  # Verify it's set
```

### "API Error 401"
- Check if your API key is correct
- Verify it hasn't expired
- Check Sarvam dashboard for account status

### "Timeout Error"
- Increase max_tokens might cause timeouts
- Try reducing MAX_TOKENS
- Check your network connection

### "Unexpected Output Quality"
- Adjust temperature (lower = more consistent)
- Refine system instruction (be more specific)
- Test with shorter inputs first

## Resources

- [Sarvam AI Documentation](https://docs.sarvam.ai/)
- [Model Benchmarks](https://www.sarvam.ai/models)
- [API Reference](https://api.sarvam.ai/docs)
- [Pricing](https://www.sarvam.ai/pricing)

## Notes

- Pricing shown is approximate and may vary
- Always verify current pricing with Sarvam
- Bulk discounts may be available for high volumes
- Consider reserved capacity for guaranteed throughput
