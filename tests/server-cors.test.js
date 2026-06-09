import { test, expect } from 'vitest';
import { exec } from 'child_process';

test('server requires CORS_ORIGIN in production', () => {
  return new Promise((resolve) => {
    exec('node backend/server.js', {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ADMIN_PASSWORD: 'test',
        TOKEN_SECRET: 'test'
      }
    }, (error, stdout, stderr) => {
      expect(error).not.toBeNull();
      expect(stderr).toContain('CORS_ORIGIN');
      resolve();
    });
  });
});
