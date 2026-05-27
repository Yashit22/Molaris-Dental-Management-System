# Sarvam-105B Template Testing Guide

## Overview

The `test_sarvam_templates.js` script allows you to test all 7 clinical documentation templates with Sarvam-105B. Each template uses its exact system instruction from `dms_backend/config/templates.config.js`.

## Quick Start

```bash
export SARVAM_API_KEY="sk_irg3p455_QQQHtCF9aVD4HWEEJdkBlpvG"
node test_sarvam_templates.js
```

## Available Templates

| Template ID | Name | Category | Use Case |
|------------|------|----------|----------|
| `patient_letter` | Patient Letter | Patient Comms | Patient-friendly summary letter |
| `dentistry_note` | Dentistry Note | Clinical | Comprehensive clinical documentation |
| `comprehensive_exam` | Comprehensive Dental Exam | Clinical | Detailed exam with procedures & findings |
| `soap_note` | SOAP Note | Clinical | Subjective, Objective, Assessment, Plan |
| `soap_note_issues` | SOAP Note (Issues Centric) | Clinical | SOAP organized by individual issues |
| `hp_note` | H&P Note | Clinical | History & Physical examination |
| `hp_note_issues` | H&P Note (Issues Centric) | Clinical | H&P organized by individual issues |

## Available Transcriptions

### 1. **Headache** (English - General Medical)
```
Doctor: Good morning, what brings you in today?
Patient: Hi doctor, I've been having this persistent headache for about 3 days now...
```

### 2. **Impacted Canine** (Hindi/Hinglish - Dental Orthodontics)
```
डॉक्टर: आप कैसा महसूस कर रहे हैं?
मरीज: डॉक्टर, मेरा ऊपर वाला दाहिनी तरफ का कैनाइन दांत...
```

### 3. **Root Canal** (English - Endodontics)
```
Doctor: You've been experiencing severe pain in your lower left molar?
Patient: Yes, it started 3 days ago. It's a throbbing pain...
```

## Test Commands by Template

### Patient Letter (Patient Comms)
```bash
# Default: Hindi impacted canine case
TEMPLATE=patient_letter node test_sarvam_templates.js

# With root canal case
TEMPLATE=patient_letter TRANSCRIPTION=root_canal node test_sarvam_templates.js

# With headache case
TEMPLATE=patient_letter TRANSCRIPTION=headache node test_sarvam_templates.js

# With custom transcription
TEMPLATE=patient_letter INPUT_TRANSCRIPTION="Your custom transcription" node test_sarvam_templates.js
```

### Dentistry Note (Clinical)
```bash
# Root canal case (recommended for this template)
TEMPLATE=dentistry_note TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Impacted canine case
TEMPLATE=dentistry_note TRANSCRIPTION=impacted_canine node test_sarvam_templates.js

# Custom input
TEMPLATE=dentistry_note INPUT_TRANSCRIPTION="Your transcription" node test_sarvam_templates.js
```

### Comprehensive Dental Exam (Clinical)
```bash
# Test with any transcription
TEMPLATE=comprehensive_exam TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Test with custom transcription
TEMPLATE=comprehensive_exam INPUT_TRANSCRIPTION="Doctor: Comprehensive exam... " node test_sarvam_templates.js
```

### SOAP Note (Structured Clinical)
```bash
# Standard SOAP format
TEMPLATE=soap_note TRANSCRIPTION=root_canal node test_sarvam_templates.js

# With adjusted parameters for faster response
TEMPLATE=soap_note TEMPERATURE=0.3 MAX_TOKENS=1500 TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

### SOAP Note - Issues Centric (Multi-Issue Tracking)
```bash
# Issues-organized SOAP
TEMPLATE=soap_note_issues TRANSCRIPTION=root_canal node test_sarvam_templates.js

# With custom system instruction
TEMPLATE=soap_note_issues SYSTEM_INSTRUCTION="Custom instruction" TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

### H&P Note (History & Physical)
```bash
# Standard H&P format
TEMPLATE=hp_note TRANSCRIPTION=root_canal node test_sarvam_templates.js

# With higher temperature for more detailed output
TEMPLATE=hp_note TEMPERATURE=0.7 MAX_TOKENS=2500 TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

### H&P Note - Issues Centric (Problems-Based)
```bash
# Issues-organized H&P (best for complex cases)
TEMPLATE=hp_note_issues TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Test with custom transcription
TEMPLATE=hp_note_issues INPUT_TRANSCRIPTION="Your complex case" node test_sarvam_templates.js
```

## Parameter Tuning

### Temperature (Controls Consistency vs Creativity)
```bash
# Conservative - More consistent output
TEMPLATE=patient_letter TEMPERATURE=0.2 node test_sarvam_templates.js

# Balanced (default)
TEMPLATE=patient_letter TEMPERATURE=0.5 node test_sarvam_templates.js

# More detailed/creative
TEMPLATE=patient_letter TEMPERATURE=0.8 node test_sarvam_templates.js
```

### Max Tokens (Controls Output Length & Cost)
```bash
# Short summary (cheaper, faster)
TEMPLATE=dentistry_note MAX_TOKENS=800 TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Standard comprehensive
TEMPLATE=dentistry_note MAX_TOKENS=2000 TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Very detailed
TEMPLATE=dentistry_note MAX_TOKENS=3000 TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

### Top-P (Controls Diversity)
```bash
# Focused output
TEMPLATE=soap_note TOP_P=0.7 TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Balanced (default)
TEMPLATE=soap_note TOP_P=1.0 TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

## Understanding the Output

### Token Usage & Costs
```
Input Tokens: 326
Output Tokens: 2000
Total Tokens: 2326

Input Cost: $0.000000
Output Cost: $0.000008
Total Cost: $0.000008

Monthly (100 transcriptions): $0.0008
Monthly (1000 transcriptions): $0.01
```

**Cost Calculation:**
- Input: $0.0015 per 1M tokens
- Output: $0.004 per 1M tokens

### Performance Metrics
```
Response Time: 16.39 seconds
Tokens/Second: 141.95
```

## Recommended Template Selection

| Use Case | Recommended Template | Why |
|----------|----------------------|-----|
| Patient education/communication | **Patient Letter** | Uses patient-friendly language, explains medical terms |
| Clinical documentation (simple) | **Dentistry Note** | Complete clinical overview, professional language |
| Detailed comprehensive exam | **Comprehensive Dental Exam** | Structured, includes procedures, findings, consent |
| Standard clinical note | **SOAP Note** | Traditional SOAP format, widely accepted |
| Multiple issues in one visit | **SOAP Note (Issues Centric)** | Organized by problem, better for complex cases |
| Detailed H&P examination | **H&P Note** | Complete history and physical examination |
| Complex multi-problem cases | **H&P Note (Issues Centric)** | Problems organized separately with full plan for each |

## System Instructions Summary

### Patient Letter
> *"Use patient-friendly, clear and empathetic language, avoid medical jargon or explain it briefly in simple terms, and keep instructions concise and actionable."*

### Dentistry Note
> *"Use professional clinical language appropriate for clinical record-keeping. Include tooth numbers using FDI notation. Organize findings systematically by anatomical region and complaint."*

### Comprehensive Dental Exam
> *"Use professional clinical language appropriate for formal clinical record-keeping. Be comprehensive but organized. When information is not provided, write 'N/A'."*

### SOAP Note
> *"Organize findings systematically using the SOAP format. Never come up with your own patient details - use only what was explicitly discussed."*

### SOAP Note (Issues Centric)
> *"Organize findings by individual issues or problems using the SOAP format for each issue."*

### H&P Note
> *"Organize findings systematically using standard H&P format with clear separation between history, examination, investigations, assessment, and plan sections."*

### H&P Note (Issues Centric)
> *"For the assessment and plan, organize findings by individual issues or problems."*

## Example Workflows

### Workflow 1: Generate Multiple Formats from One Transcription
```bash
# Test the same root canal case with all templates
for template in patient_letter dentistry_note comprehensive_exam soap_note soap_note_issues hp_note hp_note_issues; do
  echo "Testing: $template"
  TEMPLATE=$template TRANSCRIPTION=root_canal node test_sarvam_templates.js
done
```

### Workflow 2: Test Template Quality Across Languages
```bash
# Test Patient Letter with different languages
TEMPLATE=patient_letter TRANSCRIPTION=impacted_canine node test_sarvam_templates.js  # Hindi
TEMPLATE=patient_letter TRANSCRIPTION=root_canal node test_sarvam_templates.js      # English
TEMPLATE=patient_letter TRANSCRIPTION=headache node test_sarvam_templates.js        # English
```

### Workflow 3: Optimize for Your Volume & Cost
```bash
# Test cost optimization for 100/day volume
TEMPLATE=dentistry_note TEMPERATURE=0.3 MAX_TOKENS=1200 TRANSCRIPTION=root_canal node test_sarvam_templates.js

# Test for comprehensive notes
TEMPLATE=comprehensive_exam TEMPERATURE=0.6 MAX_TOKENS=2500 TRANSCRIPTION=root_canal node test_sarvam_templates.js
```

## Troubleshooting

### API Error 403: Forbidden
- Check API key: `echo $SARVAM_API_KEY`
- Verify key hasn't expired in Sarvam dashboard
- Try a new key if needed

### Timeout Errors
- Reduce `MAX_TOKENS` to smaller value (e.g., 1000)
- Check internet connection
- Sarvam API might be rate-limited

### Output Too Short
- Increase `MAX_TOKENS` (default 2000)
- Lower `TEMPERATURE` for more focused output
- Use a longer transcription

### Output Too Long/Incomplete
- Reduce `MAX_TOKENS`
- Use concise transcription
- Try `MAX_TOKENS=2000` as standard

## Cost Estimation Calculator

Based on the test results:
```
Average tokens per transcription: ~2,300 tokens
Average cost per transcription: ~$0.000009

Volume Estimates:
- 100/day:   $0.0008/day  = $24/year
- 1000/day:  $0.009/day   = $270/year
- 5000/day:  $0.045/day   = $1,350/year
- 10000/day: $0.09/day    = $2,700/year
```

*Note: These are estimates. Actual costs depend on transcription length and selected parameters.*

## Environment Variables Reference

```bash
SARVAM_API_KEY="your-api-key"              # Required
TEMPLATE="patient_letter"                   # Default template
TRANSCRIPTION="root_canal"                  # Default transcription
INPUT_TRANSCRIPTION="custom text"           # Override transcription
SYSTEM_INSTRUCTION="custom instruction"     # Override system instruction
TEMPERATURE=0.5                             # 0.0-2.0 (default 0.5)
TOP_P=1                                     # 0.0-1.0 (default 1)
MAX_TOKENS=2000                             # default 2000
DEBUG=true                                  # Enable full API response logging
```

## Next Steps

1. ✅ **Test all templates** with your actual transcriptions
2. ✅ **Measure token usage** for your typical cases
3. ✅ **Calculate costs** for your monthly volume
4. ✅ **Compare with alternatives** (Claude, GPT-4, etc.)
5. ✅ **Get clinical review** of generated outputs
6. ✅ **Plan integration** with your EHR/DMS system

## Support

For issues or questions:
1. Check Sarvam API documentation: https://docs.sarvam.ai/
2. Verify API key in Sarvam dashboard
3. Review template system instructions in `dms_backend/config/templates.config.js`
4. Test with sample transcriptions first before using real data
