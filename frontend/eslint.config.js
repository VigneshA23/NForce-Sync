import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Keep inline fontFamily usage on the design system's two typefaces
      // (Inter for headings/body, JetBrains Mono for numeric/code text) —
      // mirrors the _adherence.oxlintrc.json rule used by the design-system
      // prototype files, applied here to the real app so CI/lint catches
      // any new hardcoded off-brand font.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Property[key.name='fontFamily'][value.type='Literal'][value.value=/^(?!.*(Inter|JetBrains Mono|inherit)).*$/]",
          message:
            'Font not provided by the design system. Available: Inter, JetBrains Mono, inherit.',
        },
      ],
    },
  },
])
