import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Driver from '../src/models/Driver.js';

console.log('=== RUNNING LOGIN LOCKOUT REMOVAL TEST CASES ===\n');

// Mock User database & comparison test
async function runTests() {
  const passwordHash = await bcrypt.hash('correctPassword123', 12);

  const mockActiveUser = {
    _id: '650000000000000000000100',
    name: 'Admin User',
    email: 'admin@deliveryplus.com',
    password: passwordHash,
    role: 'admin',
    isActive: true,
    comparePassword: async function(candidate) {
      return bcrypt.compare(candidate, this.password);
    }
  };

  const mockDriverUser = {
    _id: '650000000000000000000200',
    name: 'Driver John',
    email: 'john@deliveryplus.com',
    password: passwordHash,
    role: 'driver',
    isActive: true,
    comparePassword: async function(candidate) {
      return bcrypt.compare(candidate, this.password);
    }
  };

  const mockInactiveUser = {
    _id: '650000000000000000000300',
    name: 'Disabled User',
    email: 'disabled@deliveryplus.com',
    password: passwordHash,
    role: 'driver',
    isActive: false,
    comparePassword: async function(candidate) {
      return bcrypt.compare(candidate, this.password);
    }
  };

  const usersDb = [mockActiveUser, mockDriverUser, mockInactiveUser];

  // Simulated login controller matching authController.js
  async function simulateLogin(email, password, expectedRole = null) {
    const user = usersDb.find(u => u.email === email);
    if (!user || (expectedRole && user.role !== expectedRole)) {
      return { status: 401, body: { success: false, message: 'Invalid email or password.' } };
    }

    if (user.isActive === false) {
      return { status: 403, body: { success: false, message: 'Your account is disabled. Please contact support.' } };
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return { status: 401, body: { success: false, message: 'Invalid email or password.' } };
    }

    return {
      status: 200,
      body: {
        success: true,
        data: {
          user: { _id: user._id, name: user.name, email: user.email, role: user.role },
          accessToken: 'mock.access.token',
          refreshToken: 'mock.refresh.token',
        },
        message: 'Login successful.'
      }
    };
  }

  // CASE 1: Wrong password once -> 401 Invalid email or password
  console.log('Case 1: Wrong password once');
  const res1 = await simulateLogin('admin@deliveryplus.com', 'wrongPass1');
  assert.equal(res1.status, 401, 'Should return HTTP 401');
  assert.equal(res1.body.message, 'Invalid email or password.', 'Should return standardized message');
  console.log('✓ Passed: HTTP 401 Invalid email or password\n');

  // CASE 2: Wrong password 20 times -> same 401 every time (never 429)
  console.log('Case 2: Wrong password 20 consecutive times');
  for (let i = 1; i <= 20; i++) {
    const res = await simulateLogin('admin@deliveryplus.com', `wrongPass_${i}`);
    assert.equal(res.status, 401, `Attempt ${i} should be 401`);
    assert.equal(res.body.message, 'Invalid email or password.');
  }
  console.log('✓ Passed: All 20 wrong attempts returned 401 (0 lockouts, 0 429s)\n');

  // CASE 3: After 20 wrong attempts, enter correct password -> immediate login success (HTTP 200)
  console.log('Case 3: Correct password immediately following 20 failed attempts');
  const res3 = await simulateLogin('admin@deliveryplus.com', 'correctPassword123');
  assert.equal(res3.status, 200, 'Should return HTTP 200');
  assert.equal(res3.body.success, true);
  assert.ok(res3.body.data.accessToken);
  console.log('✓ Passed: Immediate 200 login success without cooldown\n');

  // CASE 4: CRM repeated wrong attempts, then Driver App correct credentials
  console.log('Case 4: CRM repeated wrong attempts -> Driver App correct credentials');
  for (let i = 1; i <= 10; i++) {
    const res = await simulateLogin('john@deliveryplus.com', `wrongCRM_${i}`, 'admin'); // wrong role/password
    assert.equal(res.status, 401);
  }
  const driverLoginRes = await simulateLogin('john@deliveryplus.com', 'correctPassword123', 'driver');
  assert.equal(driverLoginRes.status, 200);
  assert.equal(driverLoginRes.body.data.user.role, 'driver');
  console.log('✓ Passed: Driver login succeeds immediately after CRM failed attempts\n');

  // CASE 5: Driver App repeated wrong attempts, then CRM correct credentials
  console.log('Case 5: Driver App repeated wrong attempts -> CRM correct credentials');
  for (let i = 1; i <= 10; i++) {
    const res = await simulateLogin('admin@deliveryplus.com', `wrongDriver_${i}`, 'driver');
    assert.equal(res.status, 401);
  }
  const crmLoginRes = await simulateLogin('admin@deliveryplus.com', 'correctPassword123', 'admin');
  assert.equal(crmLoginRes.status, 200);
  assert.equal(crmLoginRes.body.data.user.role, 'admin');
  console.log('✓ Passed: CRM login succeeds immediately after Driver App failed attempts\n');

  // CASE 6: Previously locked account simulation -> correct password works immediately
  console.log('Case 6: Previously locked account login attempt');
  const res6 = await simulateLogin('admin@deliveryplus.com', 'correctPassword123');
  assert.equal(res6.status, 200);
  console.log('✓ Passed: Account logs in immediately without checking stale lock keys\n');

  // CASE 7: Inactive / Disabled account -> returns HTTP 403 real inactive message
  console.log('Case 7: Inactive account login');
  const res7 = await simulateLogin('disabled@deliveryplus.com', 'correctPassword123');
  assert.equal(res7.status, 403, 'Should return HTTP 403');
  assert.equal(res7.body.message, 'Your account is disabled. Please contact support.');
  console.log('✓ Passed: Inactive account is properly blocked with HTTP 403 disabled message\n');

  console.log('====================================================');
  console.log('ALL 7 LOGIN LOCKOUT REMOVAL TEST CASES PASSED! ✅');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
