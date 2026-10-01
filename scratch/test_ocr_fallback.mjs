const productExtractionSchema = {};

class MockModel {
  constructor(name, behavior) {
    this.name = name;
    this.behavior = behavior;
    this.attempts = 0;
  }
  async generateContent() {
    this.attempts++;
    const action = this.behavior(this.attempts);
    if (action.status === 200) {
      return { response: { text: () => JSON.stringify({ items: [{ productName: "Test", _source: this.name }] }) } };
    } else {
      throw new Error(`[${action.status}] Mock Error from ${this.name}`);
    }
  }
}

async function testFallback(scenarioName, modelBehaviors) {
  console.log(`\n=== Testing: ${scenarioName} ===`);
  const fallbackModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'];
  const maxAttemptsPerModel = 3;
  let result;
  let lastError;

  for (const modelName of fallbackModels) {
    let attempt = 0;
    let modelSuccess = false;
    
    // Get mock model
    const behavior = modelBehaviors[modelName] || (() => ({ status: 503 }));
    const model = new MockModel(modelName, behavior);
    
    while (attempt < maxAttemptsPerModel) {
      try {
        attempt++;
        console.log(`[AI OCR] model attempt: ${attempt}/${maxAttemptsPerModel}`);
        console.log(`[AI OCR] model: ${modelName}`);
        
        result = await model.generateContent();
        
        modelSuccess = true;
        console.log(`[AI OCR] status: success`);
        break; // Success
      } catch (err) {
        lastError = err;
        const errMsg = String(err);
        let statusCode = 0;
        const statusMatch = errMsg.match(/\[(\d{3})\]/);
        if (statusMatch) statusCode = parseInt(statusMatch[1]);
        if (errMsg.includes('503')) statusCode = 503;
        if (errMsg.includes('400')) statusCode = 400;
        
        console.log(`[AI OCR] status: ${statusCode || 'error'} - ${errMsg}`);
        
        const isTransient = [429, 500, 502, 503, 504].includes(statusCode);
        
        if (!isTransient) {
          console.log(`[AI OCR] Non-transient error encountered. Skipping retries for ${modelName}.`);
          break; // Break while
        }
        
        if (attempt >= maxAttemptsPerModel) {
          console.log(`[AI OCR] ${modelName} exhausted.`);
          break; // Break while
        }
        
        console.log(`[AI OCR] retrying in 0ms (mocked)...`);
      }
    }
    
    if (modelSuccess) break;
    else {
       const nextModel = fallbackModels[fallbackModels.indexOf(modelName) + 1];
       if (nextModel) console.log(`[AI OCR] fallback: moving to ${nextModel}`);
    }
  }
  
  if (!result) {
    console.log(`[AI OCR] All compatible models failed.`);
    console.log(`Final Error thrown:`, lastError.message);
  } else {
    console.log(`Final Result:`, JSON.parse(result.response.text()));
  }
}

async function runTests() {
  await testFallback("A. Primary success", {
    'gemini-3.6-flash': (a) => ({ status: 200 })
  });

  await testFallback("B. Primary 503 -> fallback success", {
    'gemini-3.6-flash': (a) => ({ status: 503 }),
    'gemini-3.7-flash': (a) => ({ status: 200 })
  });
  
  await testFallback("C. Primary + fallback 503 -> next fallback", {
    'gemini-3.6-flash': (a) => ({ status: 503 }),
    'gemini-3.7-flash': (a) => ({ status: 503 }),
    'gemini-3.5-flash': (a) => ({ status: 200 })
  });
  
  await testFallback("D. All models fail -> clean user error", {
    'gemini-3.6-flash': (a) => ({ status: 503 }),
    'gemini-3.7-flash': (a) => ({ status: 503 }),
    'gemini-3.5-flash': (a) => ({ status: 503 }),
    'gemini-3.8-flash': (a) => ({ status: 503 })
  });
  
  await testFallback("E. 400 does NOT cause pointless retries", {
    'gemini-3.6-flash': (a) => ({ status: 400 }), // Should skip retries and fail or fallback
    'gemini-3.7-flash': (a) => ({ status: 400 }),
    'gemini-3.5-flash': (a) => ({ status: 400 }),
    'gemini-3.8-flash': (a) => ({ status: 400 })
  });
}

runTests();
