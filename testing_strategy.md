# Testing Strategy - Offline-First POS System

## 1. Testing Philosophy & Principles

### 1.1 Core Testing Principles
- **Performance First**: Every test must validate <100ms scan time, <200ms search response
- **Reliability Under Failure**: System must work correctly when everything goes wrong
- **Data Integrity**: No data loss or corruption under any scenario
- **User Experience**: Cashier workflow must remain smooth under stress
- **Compliance**: All business-critical actions must be auditable

### 1.2 Testing Pyramid
```
                    /\
                   /  \
                  / E2E \
                 /______\
                /        \
               / Integration \
              /______________\
             /                \
            /     Unit Tests   \
           /____________________\
```

**Unit Tests (70%)**: Business logic, pricing engine, data validation
**Integration Tests (20%)**: Database operations, API integration, sync mechanisms
**E2E Tests (10%)**: Complete POS workflows, failure scenarios, stress testing

## 2. Performance Testing

### 2.1 Scan Performance Testing
```typescript
interface ScanPerformanceTest {
  testName: string;
  expectedMaxTime: number; // <100ms from blueprint
  testScenarios: ScanScenario[];
}

interface ScanScenario {
  description: string;
  itemCount: number;
  barcodeLength: string;
  networkConditions: 'offline' | 'slow' | 'normal';
  expectedResult: PerformanceResult;
}

// Test Cases
const scanPerformanceTests: ScanPerformanceTest[] = [
  {
    testName: 'Single Barcode Scan - Cold Cache',
    expectedMaxTime: 100,
    testScenarios: [
      {
        description: 'First scan after app load, 1000 items in DB',
        itemCount: 1000,
        barcodeLength: '13',
        networkConditions: 'offline',
        expectedResult: { maxTime: 100, avgTime: 50, successRate: 100 }
      },
      {
        description: 'Subsequent scans with hot cache',
        itemCount: 10000,
        barcodeLength: '13',
        networkConditions: 'offline',
        expectedResult: { maxTime: 50, avgTime: 25, successRate: 100 }
      }
    ]
  },
  {
    testName: 'Barcode Scan Under Load',
    expectedMaxTime: 100,
    testScenarios: [
      {
        description: '400 consecutive scans as per blueprint',
        itemCount: 2500,
        barcodeLength: '13',
        networkConditions: 'offline',
        expectedResult: { 
          maxTime: 100, 
          avgTime: 50, 
          successRate: 100,
          memoryLeakCheck: true 
        }
      }
    ]
  }
];

// Performance Test Implementation
class PerformanceTester {
  async runScanPerformanceTest(test: ScanPerformanceTest): Promise<TestResult> {
    const results: PerformanceResult[] = [];
    
    for (const scenario of test.testScenarios) {
      // Setup test database with items
      await this.setupTestData(scenario.itemCount);
      
      // Measure scan performance
      const scanResults = await this.measureScanPerformance(scenario);
      
      // Validate results
      const validation = this.validatePerformance(scanResults, scenario.expectedResult);
      
      results.push(scanResults);
    }
    
    return {
      testName: test.testName,
      results,
      overallPass: results.every(r => this.isPerformanceValid(r, test.expectedMaxTime))
    };
  }
  
  private async measureScanPerformance(scenario: ScanScenario): Promise<PerformanceResult> {
    const times: number[] = [];
    const startTime = performance.now();
    
    // Simulate 100 barcode scans
    for (let i = 0; i < 100; i++) {
      const scanStart = performance.now();
      
      // Simulate barcode scan
      const item = await this.simulateBarcodeScan(scenario.barcodeLength);
      
      const scanEnd = performance.now();
      times.push(scanEnd - scanStart);
      
      // Ensure database connection is stable
      if (i % 10 === 0) {
        await this.checkDatabaseIntegrity();
      }
    }
    
    const endTime = performance.now();
    
    return {
      maxTime: Math.max(...times),
      avgTime: times.reduce((a, b) => a + b) / times.length,
      p95Time: this.calculatePercentile(times, 95),
      p99Time: this.calculatePercentile(times, 99),
      successRate: 100,
      totalTime: endTime - startTime,
      memoryUsage: await this.getMemoryUsage()
    };
  }
}
```

### 2.2 Search Performance Testing
```typescript
interface SearchPerformanceTest {
  testName: string;
  expectedMaxTime: number; // <200ms from blueprint
  testScenarios: SearchScenario[];
}

interface SearchScenario {
  description: string;
  itemCount: number;
  searchTerms: string[];
  searchType: 'exact' | 'fuzzy' | 'partial' | 'category';
  networkConditions: 'offline' | 'slow' | 'normal';
}

const searchPerformanceTests: SearchPerformanceTest[] = [
  {
    testName: 'Item Search Performance',
    expectedMaxTime: 200,
    testScenarios: [
      {
        description: 'Search for existing items',
        itemCount: 5000,
        searchTerms: ['coca', 'sari', 'roti', 'susu', 'tepung'],
        searchType: 'partial',
        networkConditions: 'offline'
      },
      {
        description: 'Fuzzy search with typos',
        itemCount: 5000,
        searchTerms: ['coklat', 'gula', 'garam', 'kecap', 'saus'],
        searchType: 'fuzzy',
        networkConditions: 'offline'
      }
    ]
  }
];
```

## 3. Offline Functionality Testing

### 3.1 Network Interruption Testing
```typescript
interface NetworkInterruptionTest {
  testName: string;
  interruptionPatterns: InterruptionPattern[];
}

interface InterruptionPattern {
  name: string;
  duration: number;           // Duration of interruption in ms
  timing: 'before_transaction' | 'during_transaction' | 'after_transaction';
  frequency: 'once' | 'random' | 'periodic';
  networkType: 'offline' | 'slow' | 'unstable';
}

class NetworkTester {
  private originalFetch: typeof fetch;
  
  async runNetworkInterruptionTest(test: NetworkInterruptionTest): Promise<TestResult> {
    // Backup original fetch
    this.originalFetch = globalThis.fetch;
    
    try {
      // Setup network simulation
      await this.setupNetworkSimulation();
      
      const results: TestResult[] = [];
      
      for (const pattern of test.interruptionPatterns) {
        const result = await this.testInterruptionPattern(pattern);
        results.push(result);
      }
      
      return {
        testName: test.testName,
        results,
        overallPass: results.every(r => r.passed)
      };
    } finally {
      // Restore original fetch
      globalThis.fetch = this.originalFetch;
    }
  }
  
  private async setupNetworkSimulation(): Promise<void> {
    // Simulate network conditions
    globalThis.fetch = async (url, options) => {
      // Randomly delay or fail requests
      if (Math.random() < 0.3) { // 30% chance of failure
        throw new Error('NETWORK_ERROR');
      }
      
      // Add random delay
      const delay = Math.random() * 5000; // Up to 5 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.originalFetch(url, options);
    };
  }
  
  async testInterruptionPattern(pattern: InterruptionPattern): Promise<TestResult> {
    const startTime = Date.now();
    
    // Start transaction
    const transaction = await this.startTestTransaction();
    
    // Simulate network interruption
    await this.simulateNetworkInterruption(pattern);
    
    // Complete transaction while offline
    const completedTransaction = await this.completeTransaction(transaction);
    
    // Validate transaction integrity
    const validation = await this.validateTransactionIntegrity(completedTransaction);
    
    // Test sync when network returns
    await this.restoreNetwork();
    const syncResult = await this.testSyncAfterInterruption();
    
    return {
      testName: pattern.name,
      duration: Date.now() - startTime,
      passed: validation.success && syncResult.success,
      details: {
        transactionIntegrity: validation,
        syncResult,
        networkPattern: pattern
      }
    };
  }
}

const networkInterruptionTests: NetworkInterruptionTest[] = [
  {
    testName: 'Complete Transaction Offline',
    interruptionPatterns: [
      {
        name: 'Offline During Sale',
        duration: 30000, // 30 seconds
        timing: 'during_transaction',
        frequency: 'once',
        networkType: 'offline'
      },
      {
        name: 'Intermittent Network',
        duration: 5000, // 5 seconds
        timing: 'after_transaction',
        frequency: 'periodic',
        networkType: 'unstable'
      }
    ]
  }
];
```

### 3.2 Browser Crash Recovery Testing
```typescript
interface CrashRecoveryTest {
  testName: string;
  crashScenarios: CrashScenario[];
}

interface CrashScenario {
  name: string;
  crashAt: '25%' | '50%' | '75%' | '90%';
  crashType: 'tab_close' | 'browser_close' | 'tab_refresh' | 'power_loss';
  recoveryAction: 'manual_reopen' | 'auto_reopen' | 'restart_browser';
}

class CrashRecoveryTester {
  async runCrashRecoveryTest(test: CrashRecoveryTest): Promise<TestResult> {
    const results: CrashRecoveryResult[] = [];
    
    for (const scenario of test.crashScenarios) {
      const result = await this.testCrashScenario(scenario);
      results.push(result);
    }
    
    return {
      testName: test.testName,
      results,
      overallPass: results.every(r => r.dataRecovered && r.transactionIntact)
    };
  }
  
  async testCrashScenario(scenario: CrashScenario): Promise<CrashRecoveryResult> {
    // Start transaction
    const transaction = await this.startTestTransaction();
    const targetProgress = this.getProgressFromString(scenario.crashAt);
    
    // Progress transaction to crash point
    await this.progressTransaction(transaction, targetProgress);
    
    // Simulate crash
    await this.simulateCrash(scenario);
    
    // Recovery
    await this.recoverFromCrash(scenario);
    
    // Validate recovery
    const cartState = await this.getCurrentCartState();
    const transactionState = await this.getTransactionState(transaction.id);
    const auditLog = await this.getAuditLog(transaction.id);
    
    return {
      scenario: scenario.name,
      dataRecovered: !!cartState,
      transactionIntact: !!transactionState,
      auditLogged: !!auditLog,
      recoveryTime: await this.measureRecoveryTime(),
      cartItems: cartState?.items?.length || 0,
      transactionProgress: transactionState?.progress || 0
    };
  }
  
  private async simulateCrash(scenario: CrashScenario): Promise<void> {
    switch (scenario.crashType) {
      case 'tab_close':
        // Simulate tab closure
        window.dispatchEvent(new Event('beforeunload'));
        break;
      case 'browser_close':
        // Simulate browser closure
        window.close();
        break;
      case 'tab_refresh':
        // Simulate page refresh
        location.reload();
        break;
      case 'power_loss':
        // Simulate power loss (page becomes unresponsive)
        await this.simulatePowerLoss();
        break;
    }
  }
}

const crashRecoveryTests: CrashRecoveryTest[] = [
  {
    testName: 'Transaction Recovery After Crash',
    crashScenarios: [
      {
        name: 'Crash at 90% transaction completion',
        crashAt: '90%',
        crashType: 'tab_close',
        recoveryAction: 'manual_reopen'
      },
      {
        name: 'Browser crash with auto-restart',
        crashAt: '75%',
        crashType: 'browser_close',
        recoveryAction: 'auto_reopen'
      },
      {
        name: 'Power loss during transaction',
        crashAt: '50%',
        crashType: 'power_loss',
        recoveryAction: 'restart_browser'
      }
    ]
  }
];
```

## 4. Business Logic Testing

### 4.1 Pricing Engine Testing
```typescript
interface PricingEngineTest {
  testName: string;
  scenarios: PricingScenario[];
}

interface PricingScenario {
  name: string;
  items: TestItem[];
  pricingRules: PricingRule[];
  expectedTotal: number;
  expectedBreakdown: PriceBreakdown;
}

interface TestItem {
  itemId: string;
  basePrice: number;
  quantity: number;
  category: string;
  barcodes: string[];
}

interface PriceBreakdown {
  subtotal: number;
  discounts: DiscountLine[];
  taxes: TaxLine[];
  total: number;
}

class PricingEngineTester {
  async testPricingScenarios(test: PricingEngineTest): Promise<TestResult> {
    const results: PricingResult[] = [];
    
    for (const scenario of test.scenarios) {
      const result = await this.testPricingScenario(scenario);
      results.push(result);
    }
    
    return {
      testName: test.testName,
      results,
      overallPass: results.every(r => r.passed)
    };
  }
  
  private async testPricingScenario(scenario: PricingScenario): Promise<PricingResult> {
    // Load pricing rules into database
    await this.loadPricingRules(scenario.pricingRules);
    
    // Calculate prices using pricing engine
    const calculation = await this.calculateCartPricing(scenario.items);
    
    // Validate results
    const validation = this.validatePricingCalculation(
      calculation,
      scenario.expectedBreakdown
    );
    
    // Test rule hierarchy (blueprint requirement)
    const hierarchyTest = await this.testRuleHierarchy(scenario.pricingRules);
    
    return {
      scenario: scenario.name,
      passed: validation.success && hierarchyTest.success,
      calculatedTotal: calculation.total,
      expectedTotal: scenario.expectedTotal,
      difference: Math.abs(calculation.total - scenario.expectedTotal),
      ruleEvaluation: hierarchyTest,
      validation
    };
  }
  
  private async testRuleHierarchy(rules: PricingRule[]): Promise<HierarchyTestResult> {
    // Test each priority level from blueprint
    const priorities = [1, 2, 3, 4, 5, 6, 7, 8];
    const results: PriorityTest[] = [];
    
    for (const priority of priorities) {
      const rulesAtPriority = rules.filter(r => r.priority === priority);
      
      if (rulesAtPriority.length === 0) continue;
      
      // Test that rules at this priority override lower priorities
      const higherPriorityRules = rules.filter(r => r.priority < priority);
      const lowerPriorityRules = rules.filter(r => r.priority > priority);
      
      const test = await this.compareRulePriorities(
        rulesAtPriority,
        higherPriorityRules,
        lowerPriorityRules
      );
      
      results.push({
        priority,
        rulesCount: rulesAtPriority.length,
        correctlyOverrides: test.correctlyOverrides,
        conflictCount: test.conflicts
      });
    }
    
    return {
      priorities: results,
      allPrioritiesCorrect: results.every(r => r.correctlyOverrides),
      totalConflicts: results.reduce((sum, r) => sum + r.conflictCount, 0)
    };
  }
}

const pricingEngineTests: PricingEngineTest[] = [
  {
    testName: 'Complete Pricing Rule Hierarchy',
    scenarios: [
      {
        name: 'All 8 pricing rule types active',
        items: [
          { itemId: 'ITEM001', basePrice: 100, quantity: 1, category: 'Food', barcodes: ['1234567890123'] },
          { itemId: 'ITEM002', basePrice: 200, quantity: 2, category: 'Beverage', barcodes: ['2345678901234'] }
        ],
        pricingRules: [
          // Priority 1: Base Item Price
          { id: 'RULE001', priority: 1, ruleType: 'BASE_PRICE', discountType: 'PERCENTAGE', discountValue: 0 },
          // Priority 2: Branch Override
          { id: 'RULE002', priority: 2, ruleType: 'BRANCH_OVERRIDE', discountType: 'PERCENTAGE', discountValue: 5 },
          // Priority 3: Member Price
          { id: 'RULE003', priority: 3, ruleType: 'MEMBER_PRICE', discountType: 'PERCENTAGE', discountValue: 10 },
          // Priority 4: Time Limited Promo
          { id: 'RULE004', priority: 4, ruleType: 'TIME_LIMITED_PROMO', discountType: 'PERCENTAGE', discountValue: 15 }
        ],
        expectedTotal: 285, // After all discounts
        expectedBreakdown: {
          subtotal: 500,
          discounts: [
            { type: 'BRANCH_OVERRIDE', amount: 25 },
            { type: 'MEMBER_PRICE', amount: 47.5 },
            { type: 'TIME_LIMITED_PROMO', amount: 64.125 }
          ],
          taxes: [{ type: 'VAT', amount: 42.75 }],
          total: 285
        }
      }
    ]
  }
];
```

### 4.2 Transaction Integrity Testing
```typescript
interface TransactionIntegrityTest {
  testName: string;
  scenarios: IntegrityScenario[];
}

interface IntegrityScenario {
  name: string;
  testType: 'concurrent_sales' | 'duplicate_prevention' | 'audit_trail' | 'data_consistency';
  setup: any;
  actions: IntegrityAction[];
  validations: IntegrityValidation[];
}

interface IntegrityAction {
  type: 'add_item' | 'remove_item' | 'override_price' | 'complete_transaction' | 'cancel_transaction';
  params: any;
  timing: number; // ms after test start
}

class TransactionIntegrityTester {
  async runIntegrityTests(test: TransactionIntegrityTest): Promise<TestResult> {
    const results: IntegrityResult[] = [];
    
    for (const scenario of test.scenarios) {
      const result = await this.testIntegrityScenario(scenario);
      results.push(result);
    }
    
    return {
      testName: test.testName,
      results,
      overallPass: results.every(r => r.passed)
    };
  }
  
  async testIntegrityScenario(scenario: IntegrityScenario): Promise<IntegrityResult> {
    const startTime = Date.now();
    
    // Setup test environment
    await this.setupTestEnvironment(scenario.setup);
    
    // Execute actions with timing
    for (const action of scenario.actions) {
      const delay = action.timing - (Date.now() - startTime);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      await this.executeIntegrityAction(action);
    }
    
    // Validate integrity
    const validations = await this.runIntegrityValidations(scenario.validations);
    
    // Check audit trail
    const auditTrail = await this.validateAuditTrail(scenario);
    
    return {
      scenario: scenario.name,
      passed: validations.every(v => v.passed) && auditTrail.complete,
      duration: Date.now() - startTime,
      validations,
      auditTrail,
      dataIntegrity: await this.checkDataIntegrity()
    };
  }
}

const transactionIntegrityTests: TransactionIntegrityTest[] = [
  {
    testName: 'Concurrent Transaction Safety',
    scenarios: [
      {
        name: 'Multiple cashiers processing same item',
        testType: 'concurrent_sales',
        setup: {
          item: { id: 'ITEM001', stock: 10 },
          cashiers: ['cashier1', 'cashier2', 'cashier3']
        },
        actions: [
          { type: 'add_item', params: { itemId: 'ITEM001', quantity: 3 }, timing: 0 },
          { type: 'add_item', params: { itemId: 'ITEM001', quantity: 4 }, timing: 100 },
          { type: 'add_item', params: { itemId: 'ITEM001', quantity: 5 }, timing: 200 }
        ],
        validations: [
          { type: 'stock_consistency', expected: 10 },
          { type: 'no_negative_stock', expected: true },
          { type: 'all_transactions_logged', expected: 3 }
        ]
      }
    ]
  }
];
```

## 5. Security Testing

### 5.1 Anti-Fraud Testing
```typescript
interface SecurityTest {
  testName: string;
  attackVectors: AttackVector[];
}

interface AttackVector {
  name: string;
  type: 'price_override_abuse' | 'double_return' | 'unauthorized_access' | 'data_tampering';
  steps: SecurityStep[];
  expectedOutcome: 'blocked' | 'logged' | 'requires_approval';
}

interface SecurityStep {
  action: string;
  parameters: any;
  expectedResult: 'success' | 'blocked' | 'requires_auth';
}

class SecurityTester {
  async runSecurityTests(test: SecurityTest): Promise<SecurityResult> {
    const results: AttackTestResult[] = [];
    
    for (const vector of test.attackVectors) {
      const result = await this.testAttackVector(vector);
      results.push(result);
    }
    
    return {
      testName: test.testName,
      results,
      overallSecurity: this.calculateOverallSecurity(results)
    };
  }
  
  async testAttackVector(vector: AttackVector): Promise<AttackTestResult> {
    // Start as authenticated user
    await this.authenticateAsUser('cashier');
    
    const steps: SecurityStepResult[] = [];
    
    for (const step of vector.steps) {
      const stepResult = await this.executeSecurityStep(step);
      steps.push(stepResult);
      
      // Check if attack was blocked
      if (stepResult.result === 'blocked') {
        break;
      }
    }
    
    // Validate security response
    const securityResponse = this.validateSecurityResponse(vector, steps);
    
    return {
      attackType: vector.type,
      attackName: vector.name,
      steps,
      blockedAt: securityResponse.blockedAt,
      auditLogged: securityResponse.auditLogged,
      requiresApproval: securityResponse.requiresApproval,
      securityScore: this.calculateSecurityScore(securityResponse)
    };
  }
  
  private async testPriceOverrideAbuse(): Promise<void> {
    // Attempt multiple price overrides without approval
    const attempts = [
      { itemId: 'ITEM001', overridePrice: 1, reason: 'Test' },
      { itemId: 'ITEM001', overridePrice: 0.5, reason: 'Test' },
      { itemId: 'ITEM001', overridePrice: 0.01, reason: 'Test' }
    ];
    
    for (const attempt of attempts) {
      const result = await this.attemptPriceOverride(attempt);
      
      // Should be blocked or require supervisor approval
      if (result.requiresAuth && !result.authenticated) {
        console.log(`✅ Override blocked: ${attempt.overridePrice}`);
      } else if (result.logged) {
        console.log(`⚠️ Override logged but not blocked`);
      }
    }
  }
}

const securityTests: SecurityTest[] = [
  {
    testName: 'Anti-Fraud Security Tests',
    attackVectors: [
      {
        name: 'Price Override Abuse',
        type: 'price_override_abuse',
        steps: [
          { action: 'attempt_override', parameters: { price: 0.01 }, expectedResult: 'blocked' },
          { action: 'attempt_override', parameters: { price: 0.5 }, expectedResult: 'requires_auth' },
          { action: 'attempt_multiple_overrides', parameters: { count: 5 }, expectedResult: 'blocked' }
        ],
        expectedOutcome: 'logged'
      },
      {
        name: 'Double Return Prevention',
        type: 'double_return',
        steps: [
          { action: 'process_return', parameters: { invoiceId: 'INV001', items: ['ITEM001'] }, expectedResult: 'success' },
          { action: 'attempt_same_return', parameters: { invoiceId: 'INV001', items: ['ITEM001'] }, expectedResult: 'blocked' }
        ],
        expectedOutcome: 'blocked'
      }
    ]
  }
];
```

## 6. Load & Stress Testing

### 6.1 POS Stress Test (Blueprint Requirement)
```typescript
interface StressTest {
  testName: string;
  blueprintRequirement: string;
  testScenarios: StressScenario[];
}

interface StressScenario {
  name: string;
  duration: number; // minutes
  concurrentUsers: number;
  transactionsPerUser: number;
  networkConditions: 'normal' | 'slow' | 'intermittent';
  performanceTargets: PerformanceTarget;
}

class StressTester {
  async runBlueprintStressTest(test: StressTest): Promise<StressTestResult> {
    console.log(`🚀 Running blueprint stress test: ${test.testName}`);
    
    const startTime = Date.now();
    const results: ScenarioResult[] = [];
    
    for (const scenario of test.testScenarios) {
      const result = await this.runStressScenario(scenario);
      results.push(result);
      
      // Validate blueprint requirement
      const blueprintPass = this.validateBlueprintRequirement(
        result,
        test.blueprintRequirement
      );
      
      console.log(`📊 ${scenario.name}: ${blueprintPass ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    const totalTime = Date.now() - startTime;
    
    return {
      testName: test.testName,
      duration: totalTime,
      scenarios: results,
      blueprintCompliance: results.every(r => r.blueprintPass),
      overallScore: this.calculateOverallScore(results)
    };
  }
  
  async runStressScenario(scenario: StressScenario): Promise<ScenarioResult> {
    const workers: Worker[] = [];
    const metrics: StressMetrics = {
      transactionsCompleted: 0,
      transactionsFailed: 0,
      averageResponseTime: 0,
      memoryUsage: [],
      errors: []
    };
    
    // Create worker threads for concurrent users
    for (let i = 0; i < scenario.concurrentUsers; i++) {
      const worker = new Worker();
      workers.push(worker);
      
      worker.execute(async () => {
        for (let j = 0; j < scenario.transactionsPerUser; j++) {
          const transactionStart = performance.now();
          
          try {
            // Simulate complete POS transaction
            const transaction = await this.simulateCompleteTransaction();
            
            const responseTime = performance.now() - transactionStart;
            metrics.transactionsCompleted++;
            metrics.averageResponseTime += responseTime;
            
            // Memory monitoring
            if (j % 10 === 0) {
              metrics.memoryUsage.push(await this.getMemoryUsage());
            }
            
          } catch (error) {
            metrics.transactionsFailed++;
            metrics.errors.push(error.message);
          }
        }
      });
    }
    
    // Wait for all workers to complete
    await Promise.all(workers.map(w => w.waitForCompletion()));
    
    // Calculate final metrics
    metrics.averageResponseTime /= metrics.transactionsCompleted;
    
    // Validate performance targets
    const performanceValid = this.validatePerformanceTargets(
      metrics,
      scenario.performanceTargets
    );
    
    return {
      name: scenario.name,
      duration: scenario.duration,
      concurrentUsers: scenario.concurrentUsers,
      transactionsPerUser: scenario.transactionsPerUser,
      totalTransactions: scenario.concurrentUsers * scenario.transactionsPerUser,
      completedTransactions: metrics.transactionsCompleted,
      failedTransactions: metrics.transactionsFailed,
      successRate: metrics.transactionsCompleted / (metrics.transactionsCompleted + metrics.transactionsFailed),
      averageResponseTime: metrics.averageResponseTime,
      memoryUsage: metrics.memoryUsage,
      errors: metrics.errors,
      performanceTargets: performanceValid,
      blueprintPass: this.validateBlueprintScenario(metrics, scenario)
    };
  }
}

const blueprintStressTests: StressTest[] = [
  {
    testName: 'Blueprint Required Stress Tests',
    blueprintRequirement: '400 scanning beruntun, network on/off setiap 3 transaksi, shutdown browser saat transaksi 80% selesai',
    testScenarios: [
      {
        name: '400 Consecutive Barcode Scans',
        duration: 2,
        concurrentUsers: 1,
        transactionsPerUser: 400,
        networkConditions: 'intermittent',
        performanceTargets: {
          maxScanTime: 100, // ms
          maxSearchTime: 200, // ms
          successRate: 99.9,
          memoryStability: 'no_leaks'
        }
      },
      {
        name: 'Network Interruption Every 3 Transactions',
        duration: 10,
        concurrentUsers: 2,
        transactionsPerUser: 50,
        networkConditions: 'intermittent',
        performanceTargets: {
          maxScanTime: 100,
          maxSearchTime: 200,
          successRate: 99.0,
          dataIntegrity: 100
        }
      },
      {
        name: 'Crash Recovery at 80% Completion',
        duration: 5,
        concurrentUsers: 1,
        transactionsPerUser: 100,
        networkConditions: 'normal',
        performanceTargets: {
          crashRecoveryTime: 3000, // 3 seconds max
          dataRecoveryRate: 100,
          transactionIntegrity: 100
        }
      }
    ]
  }
];
```

## 7. Testing Infrastructure

### 7.1 Test Environment Setup
```typescript
class TestEnvironment {
  private testDB: POSDatabase;
  private mockServer: MockERPNextServer;
  
  async setupTestEnvironment(): Promise<void> {
    // Create isolated test database
    this.testDB = new POSDatabase('test-pos-db');
    await this.testDB.open();
    
    // Start mock ERPNext server
    this.mockServer = new MockERPNextServer();
    await this.mockServer.start(3001);
    
    // Seed test data
    await this.seedTestData();
    
    // Setup test fixtures
    await this.setupTestFixtures();
  }
  
  async teardownTestEnvironment(): Promise<void> {
    await this.testDB.close();
    await this.mockServer.stop();
    
    // Clean up IndexedDB
    await indexedDB.deleteDatabase('test-pos-db');
  }
  
  private async seedTestData(): Promise<void> {
    // Generate test items
    const testItems = this.generateTestItems(1000);
    await this.testDB.items.bulkAdd(testItems);
    
    // Generate test pricing rules
    const pricingRules = this.generatePricingRules();
    await this.testDB.pricingRules.bulkAdd(pricingRules);
    
    // Generate test users
    const users = this.generateTestUsers();
    await this.testDB.users.bulkAdd(users);
  }
  
  private generateTestItems(count: number): TestItem[] {
    const items: TestItem[] = [];
    const categories = ['Food', 'Beverage', 'Snack', 'Household', 'Personal'];
    const brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE'];
    
    for (let i = 0; i < count; i++) {
      items.push({
        id: `TEST-${String(i + 1).padStart(6, '0')}`,
        name: `Test Product ${i + 1}`,
        barcode: this.generateBarcode(),
        category: categories[i % categories.length],
        basePrice: Math.round((Math.random() * 100 + 10) * 100) / 100,
        brand: brands[i % brands.length],
        isActive: true
      });
    }
    
    return items;
  }
}
```

### 7.2 Automated Testing Pipeline
```yaml
# .github/workflows/pos-testing.yml
name: POS PWA Testing Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test -- --coverage
      - run: npm run test:performance

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - name: Start test server
        run: npm run preview &
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
          ERPNEXT_MOCK_URL: http://localhost:3001

  stress-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - name: Run blueprint stress tests
        run: npm run test:stress
        env:
          STRESS_TEST_MODE: blueprint
          PERFORMANCE_THRESHOLD: strict

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run security tests
        run: npm run test:security
      
      - name: OWASP ZAP Scan
        uses: zaproxy/action-full-scan@v0.4.0
        with:
          target: 'http://localhost:3000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'
```

## 8. Test Execution & Reporting

### 8.1 Test Execution Framework
```typescript
class POSTestRunner {
  private results: TestExecutionResult[] = [];
  
  async runAllTests(): Promise<FullTestReport> {
    console.log('🚀 Starting POS PWA Test Suite');
    
    // Performance Tests
    console.log('⚡ Running performance tests...');
    const performanceResults = await this.runPerformanceTests();
    this.results.push(...performanceResults);
    
    // Offline Tests
    console.log('📱 Running offline functionality tests...');
    const offlineResults = await this.runOfflineTests();
    this.results.push(...offlineResults);
    
    // Security Tests
    console.log('🔒 Running security tests...');
    const securityResults = await this.runSecurityTests();
    this.results.push(...securityResults);
    
    // Stress Tests
    console.log('💪 Running stress tests...');
    const stressResults = await this.runStressTests();
    this.results.push(...stressResults);
    
    // Generate report
    const report = this.generateFullReport();
    
    return report;
  }
  
  private generateFullReport(): FullTestReport {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;
    
    return {
      summary: {
        totalTests: total,
        passed,
        failed,
        successRate: (passed / total) * 100,
        executionTime: this.results.reduce((sum, r) => sum + r.duration, 0)
      },
      categories: {
        performance: this.categorizeResults('performance'),
        offline: this.categorizeResults('offline'),
        security: this.categorizeResults('security'),
        stress: this.categorizeResults('stress')
      },
      blueprintCompliance: this.checkBlueprintCompliance(),
      recommendations: this.generateRecommendations(),
      details: this.results
    };
  }
}
```

This comprehensive testing strategy ensures:

- **Blueprint Compliance**: All blueprint requirements are tested
- **Performance Validation**: <100ms scan, <200ms search requirements
- **Offline Reliability**: Crash recovery, network interruption handling
- **Security**: Anti-fraud measures, access control
- **Stress Testing**: Blueprint-required 400 scan test
- **Automation**: Continuous testing pipeline

The strategy covers all critical aspects of an offline-first POS system while maintaining the aggressive performance targets specified in the blueprint.