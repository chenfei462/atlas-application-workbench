import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [
 {ignores:['node_modules/**','dist/**','work/**','backups/**','types/database.types.ts','outputs/**','scripts/**','tests/**']},
 js.configs.recommended,...ts.configs.recommended,
 {files:['src/**/*.ts'],rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-empty-object-type':'error'}},
 // Arbitrary legacy backups are parsed only at this validated transport boundary.
 {files:['src/migration/index.ts'],rules:{'@typescript-eslint/no-explicit-any':'off'}},
];
