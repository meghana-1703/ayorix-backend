export interface TestResult {
  module: string;
  status: 'PASS' | 'FAIL';
  message: string;
}

export interface TestingResult {
  status: 'PASS' | 'FAIL';
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
}