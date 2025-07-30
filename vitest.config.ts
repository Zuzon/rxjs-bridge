import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // setupFiles: ['./tests/setupTests.ts'],
        include: ['tests/**/*.test.{ts,js}'],
    }
});
