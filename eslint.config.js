const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'server/*', '.claude/*'] },
  {
    // Text/TextInput come from components/text.tsx, which caps font scaling at 1.3x so big-print users do not break layouts.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'react-native', importNames: ['Text', 'TextInput'], message: "Import Text/TextInput from '@/components/text'." }] },
      ],
    },
  },
]);
